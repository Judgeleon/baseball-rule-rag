import { ChatOllama } from "@langchain/ollama";
import { AIMessageChunk } from "@langchain/core/messages";
import type { IChatProvider, ProviderConfig, ChatTurn } from "./types";
import { normalizeBaseUrl } from "./types";

export class OllamaProvider implements IChatProvider {
  readonly id: number;
  readonly name: string;
  readonly kind = "ollama" as const;
  readonly model: string;
  constructor(private cfg: ProviderConfig) {
    this.id = cfg.id;
    this.name = cfg.name;
    this.model = cfg.model;
  }
  private llm() {
    return new ChatOllama({
      baseUrl: normalizeBaseUrl(this.cfg.baseUrl || "http://127.0.0.1:11434"),
      model: this.cfg.model,
      temperature: this.cfg.temperature,
      numCtx: this.cfg.numCtx,
      think: this.cfg.think,
      topK: this.cfg.topK,
      streaming: true,
    });
  }
  async *stream(turns: ChatTurn[], opts?: { signal?: AbortSignal }): AsyncIterable<string> {
    const llm = this.llm();
    const msgs = turns.map((t) => ({ role: t.role, content: t.content }));
    const stream = await llm.stream(msgs, { signal: opts?.signal });
    for await (const chunk of stream) {
      const c = chunk as AIMessageChunk;
      const txt = c.content;
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
