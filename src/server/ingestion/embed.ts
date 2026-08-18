import { OllamaEmbeddings } from "@langchain/ollama";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";

export interface EmbedderConfig {
  baseUrl: string;
  model: string;
  dimensions: number;
  batchSize?: number;
}

/** Embedder 的公共接口（测试可用假实现替换） */
export interface EmbedderLike {
  readonly model: string;
  readonly dimensions: number;
  readonly embeddings: EmbeddingsInterface;
  embed(texts: string[], onBatch?: (done: number, total: number) => void): Promise<number[][]>;
  embedQuery(text: string): Promise<number[]>;
}

export class Embedder implements EmbedderLike {
  private emb: OllamaEmbeddings;
  private batch: number;
  constructor(private cfg: EmbedderConfig) {
    this.batch = cfg.batchSize ?? 32;
    this.emb = new OllamaEmbeddings({
      baseUrl: cfg.baseUrl,
      model: cfg.model,
      dimensions: cfg.dimensions,
      truncate: true,
      keepAlive: "10m",
    });
  }
  get embeddings(): EmbeddingsInterface {
    return this.emb;
  }
  get model(): string {
    return this.cfg.model;
  }
  get dimensions(): number {
    return this.cfg.dimensions;
  }
  /** 分批嵌入并回报进度 */
  async embed(texts: string[], onBatch?: (done: number, total: number) => void): Promise<number[][]> {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += this.batch) {
      const part = texts.slice(i, i + this.batch);
      const vecs = await this.emb.embedDocuments(part);
      for (const v of vecs) {
        if (v.length !== this.cfg.dimensions) {
          throw new Error(`嵌入向量维度异常：期望 ${this.cfg.dimensions}，实际 ${v.length}。请检查嵌入模型设置。`);
        }
        out.push(v);
      }
      onBatch?.(Math.min(i + this.batch, texts.length), texts.length);
    }
    return out;
  }
  async embedQuery(text: string): Promise<number[]> {
    return this.emb.embedQuery(text);
  }
}
