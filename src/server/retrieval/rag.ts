import type { IChatProvider, ChatTurn } from "../llm/types";
import type { EmbedderLike } from "../ingestion/embed";
import type { SqliteVectorStore } from "./vectorStore";
import type { Repo } from "../db/repo";
import type { Settings, ChatMessage, SourceRef, RagEvent } from "../../shared/types";
import { SYSTEM_PROMPT, CONDENSE_PROMPT, ruleRefLabel, typeLabel } from "../../shared/prompts";
import { retrieve } from "./retriever";

export interface RagDeps {
  provider: IChatProvider;
  store: SqliteVectorStore;
  embedder: EmbedderLike;
  repo: Repo;
  settings: Settings;
}

export interface RagRequest {
  question: string;
  conversationId: string;
  history: ChatMessage[];
  topK?: number;
  threshold?: number;
  signal?: AbortSignal;
}

function buildDocBlock(idx: number, s: SourceRef): string {
  const ruleRef = s.ruleNo ? `规则 ${s.ruleNo}` : "";
  const pageRef = s.page ? `第${s.page}页` : "";
  const refs = [ruleRef, s.chapter, pageRef].filter(Boolean).join(" | ");
  return `[引用${idx}] 来源：《${s.docName}》${refs ? " " + refs : ""}（${typeLabel(s.type)}）\n${s.excerpt}`;
}

export async function* runRag(req: RagRequest, deps: RagDeps): AsyncGenerator<RagEvent> {
  const { provider, store, embedder, repo, settings } = deps;
  const topK = req.topK ?? settings.retrieveTopK;
  const threshold = req.threshold ?? settings.scoreThreshold;
  const recent = req.history.slice(-Math.max(settings.maxHistoryTurns * 2, 2));

  // 1) 历史改写为独立问题
  let question = req.question;
  if (recent.length >= 2) {
    yield { type: "status", phase: "condensing" };
    const historyText = recent.map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`).join("\n");
    const prompt = CONDENSE_PROMPT.replace("{history}", historyText).replace("{question}", req.question);
    try {
      const rewritten = (await provider.invoke([{ role: "user", content: prompt }], { signal: req.signal })).trim();
      const clean = rewritten.replace(/^["'“”]+|["'“”]+$/g, "").trim();
      if (clean) question = clean;
    } catch {
      // 改写失败则使用原问题
    }
  }

  // 2) 检索
  yield { type: "status", phase: "retrieving" };
  const { sources, lowConfidence } = await retrieve(question, store, embedder.embeddings, {
    topK,
    threshold,
    includeCases: settings.includeCases,
  });
  yield { type: "sources", sources, lowConfidence };

  // 3) 组装上下文并生成
  yield { type: "status", phase: "generating" };
  const ctx = sources.map((s, i) => buildDocBlock(i + 1, s)).join("\n\n");
  const sys = (settings.systemPrompt || SYSTEM_PROMPT) + "\n\n【参考资料】\n" + (ctx || "（未检索到相关依据）");
  const turns: ChatTurn[] = [{ role: "system", content: sys }];
  for (const m of recent) turns.push({ role: m.role, content: m.content });
  turns.push({ role: "user", content: question });

  let answer = "";
  for await (const t of provider.stream(turns, { signal: req.signal })) {
    answer += t;
    yield { type: "delta", text: t };
  }

  // 4) 持久化
  repo.insertMessage({ conversationId: req.conversationId, role: "user", content: req.question });
  const aiMsgId = repo.insertMessage({
    conversationId: req.conversationId,
    role: "assistant",
    content: answer,
    sourcesJson: JSON.stringify(sources),
  });
  yield { type: "done", conversationId: req.conversationId, messageId: aiMsgId };
}
