// E2E 冒烟测试：连接真实 Ollama，索引 docs 规则 PDF，跑 3 个代表性问题并断言
import { loadConfig, getSecret } from "../src/server/config";
import { openDb } from "../src/server/db/connection";
import { seedDefaults } from "../src/server/db/seed";
import { Repo } from "../src/server/db/repo";
import { Embedder } from "../src/server/ingestion/embed";
import { SqliteVectorStore } from "../src/server/retrieval/vectorStore";
import { Indexer } from "../src/server/ingestion/indexer";
import { readSettings } from "../src/server/settings";
import { resolveActiveProvider } from "../src/server/llm/factory";
import { runRag } from "../src/server/retrieval/rag";
import { join } from "node:path";
import { copyFileSync, readdirSync } from "node:fs";

async function ensureIndexed(): Promise<boolean> {
  const config = loadConfig();
  const db = openDb(config);
  seedDefaults(db, config);
  const repo = new Repo(db);
  const settings = readSettings(repo);
  const embedder = new Embedder({ baseUrl: settings.embeddingBaseUrl, model: settings.embeddingModel, dimensions: settings.embeddingDimensions, batchSize: settings.embeddingBatch });
  const store = new SqliteVectorStore(embedder.embeddings, repo);
  await store.loadFromDb();
  if (store.count() > 0) return true;
  const docsDir = join(process.cwd(), "docs");
  const pdfs = readdirSync(docsDir).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (!pdfs.length) return false;
  const f = pdfs[0];
  const storedName = `smoke-${Date.now()}.pdf`;
  copyFileSync(join(docsDir, f), join(config.uploadsDir, storedName));
  const docId = repo.insertDocument({ name: f, storedPath: storedName, mime: "application/pdf", sizeBytes: 0, type: "rules" });
  const indexer = new Indexer({ repo, store, embedder, embeddingModel: settings.embeddingModel });
  await indexer.indexFile(docId, join(config.uploadsDir, storedName), "application/pdf");
  return store.count() > 0;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config);
  seedDefaults(db, config);
  const repo = new Repo(db);
  const secret = getSecret(config);
  const settings = readSettings(repo);
  const embedder = new Embedder({ baseUrl: settings.embeddingBaseUrl, model: settings.embeddingModel, dimensions: settings.embeddingDimensions, batchSize: settings.embeddingBatch });
  const store = new SqliteVectorStore(embedder.embeddings, repo);
  await store.loadFromDb();

  if (store.count() === 0) {
    console.log("[smoke] 知识库为空，先索引 docs 规则 PDF ...");
    const ok = await ensureIndexed();
    if (!ok) { console.error("[smoke] 无可用文档"); process.exit(1); }
  }
  const provider = resolveActiveProvider(repo, secret);
  if (!provider) { console.error("[smoke] 无可用 Provider"); process.exit(1); }
  console.log(`[smoke] Provider: ${provider.name} / ${provider.model} | 知识块: ${store.count()}`);

  const questions = [
    "二出局满垒时，击球员击出内野高飞球如何处理？",
    "投手在投球时踩踏投手板有什么规定？",
    "接手妨碍击球员时应如何判罚？",
  ];
  let pass = true;
  for (const q of questions) {
    const events: string[] = [];
    let answer = "";
    let sources = 0;
    let done = false;
    for await (const ev of runRag({ question: q, conversationId: "smoke-" + Date.now(), history: [] }, { provider, store, embedder, repo, settings })) {
      if (ev.type === "delta") answer += ev.text;
      if (ev.type === "sources") sources = ev.sources.length;
      if (ev.type === "done") done = true;
      events.push(ev.type);
    }
    // 答案需体现对检索来源的引用：规则条号（如 规则 5.09）或引用标记（如 引用1 / 【引用 1】）
    const hasRef = /(规则\s*\d\.\d{2})|(引用\s*\d)/.test(answer);
    const ok = done && answer.length > 20 && sources > 0 && hasRef;
    if (!ok) pass = false;
    console.log(`\n=== Q: ${q}`);
    console.log(`事件: ${events.join(" -> ")} | 来源: ${sources} | 含来源引用: ${hasRef}`);
    console.log("答案摘录:", answer.slice(0, 300).replace(/\n+/g, " "));
  }
  console.log(pass ? "\n[smoke] ✅ 全部通过" : "\n[smoke] ❌ 存在失败项");
  process.exit(pass ? 0 : 1);
}

main().catch((e) => { console.error("[smoke] 异常:", e); process.exit(1); });
