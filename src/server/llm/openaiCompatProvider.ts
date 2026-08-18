import { ChatOpenAI } from "@langchain/openai";
import type { IChatProvider, ProviderConfig, ChatTurn } from "./types";
import { normalizeBaseUrl } from "./types";

// deepseek-reasoner 等推理模型不支持 temperature 等采样参数
function supportsSampling(model: string): boolean {
  return !/reasoner/i.test(model);
}

export class OpenAICompatProvider implements IChatProvider {
  readonly id: number;
  readonly name: string;
  readonly kind = "openai-compatible" as const;
  readonly model: string;
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.model = cfg.model;
  }
  private llm() {
    const base: Record<string, unknown> = {
      model: this.cfg.model,
      apiKey: this.cfg.apiKey || "sk-not-set",
      baseURL: normalizeBaseUrl(this.cfg.baseUrl || "https://api.deepseek.com"),
      streaming: true,
    };
    if (supportsSampling(this.cfg.model)) {
      base.temperature = this.cfg.temperature;
    }
    return new ChatOpenAI(base);
  }
  async *stream(turns: ChatTurn[], opts?: { signal?: AbortSignal }): AsyncIterable<string> {
    const llm = this.llm();
    const msgs = turns.map((t) => ({ role: t.role, content: t.content }));
    const stream = await llm.stream(msgs, { signal: opts?.signal });
    for await (const chunk of stream) {
      const txt = chunk.content;
      if (typeof txt === "string" && txt) yield txt;
    }
  }
  async invoke(turns: ChatTurn[], opts?: { signal?: AbortSignal }): Promise<string> {
    const llm = this.llm();
    const msgs = turns.map((t) => ({ role: t.role, content: t.content }));
    const res = await llm.invoke(msgs, { signal: opts?.signal });
    const txt = res.content;
    return typeof txt === "string" ? txt : JSON.stringify(txt);
  }
  async testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }> {
    const start = Date.now();
    try {
      await this.invoke([{ role: "user", content: "ping" }]);
      return { ok: true, latencyMs: Date.now() - start };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }
}
