// 测试用假实现：内存 DB + 确定性向量 + 固定流式回答
import type { AppConfig } from "../config";
import { openDb, type Db } from "../db/connection";
import { seedDefaults } from "../db/seed";
import { Repo } from "../db/repo";
import { SqliteVectorStore } from "../retrieval/vectorStore";
import { Indexer, TaskQueue } from "../ingestion/indexer";
import { readSettings } from "../settings";
import type { EmbedderLike } from "../ingestion/embed";
import type { IChatProvider, ChatTurn } from "../llm/types";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { Dependencies } from "../app";
import type { RagDeps } from "../retrieval/rag";

const TEST_CONFIG: AppConfig = {
  port: 0,
  host: "127.0.0.1",
  dataDir: ":memory:",
  dataDirAbs: process.cwd() + "/.tmp-test",
  dbPath: ":memory:",
  uploadsDir: process.cwd() + "/.tmp-test-uploads",
  ollamaBaseUrl: "http://127.0.0.1:11434",
  embeddingModel: "fake-embed",
  embeddingDimensions: 8,
  defaultChatModel: "fake-chat",
};

export function makeTestConfig(): AppConfig {
  return { ...TEST_CONFIG };
}

export class FakeEmbeddings implements EmbeddingsInterface {
  constructor(private dim = 8) {}
  model = "fake";
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return texts.map((t) => this.hashVec(t));
  }
  async embedQuery(text: string): Promise<number[]> {
    return this.hashVec(text);
  }
  private hashVec(t: string): number[] {
    const v = new Array(this.dim).fill(0);
    for (let i = 0; i < t.length; i++) {
      const c = t.charCodeAt(i);
      v[c % this.dim] += 1;
      if (i + 1 < t.length) v[(c * 31 + t.charCodeAt(i + 1)) % this.dim] += 1;
    }
    const norm = Math.sqrt(v.reduce((a, b) => a + b * b, 0)) || 1;
    return v.map((x) => x / norm);
  }
}

export class FakeEmbedder implements EmbedderLike {
  readonly model = "fake-embed";
  readonly dimensions = 8;
  readonly embeddings: EmbeddingsInterface;
  constructor() {
    this.embeddings = new FakeEmbeddings(this.dimensions);
  }
  async embed(texts: string[]): Promise<number[][]> {
    return this.embeddings.embedDocuments(texts);
  }
  async embedQuery(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }
}

export class FakeProvider implements IChatProvider {
  readonly id = 1;
  readonly name = "fake";
  readonly kind = "ollama" as const;
  readonly model = "fake-chat";
  constructor(private answer = "结论：依照规则 5.07 的规定处理。") {}
  async *stream(turns: ChatTurn[]): AsyncIterable<string> {
    for (const ch of this.answer) yield ch;
  }
  async invoke(): Promise<string> {
    return "规则 5.07";
  }
  async testConnection() {
    return { ok: true, latencyMs: 1 };
  }
}

export interface TestContext {
  config: AppConfig;
  db: Db;
  repo: Repo;
  store: SqliteVectorStore;
  embedder: FakeEmbedder;
  provider: FakeProvider;
  deps: Dependencies;
}

export function buildTestContext(answer?: string): TestContext {
  const config = makeTestConfig();
  const db = openDb(config);
  seedDefaults(db, config);
  const repo = new Repo(db);
  const embedder = new FakeEmbedder();
  const store = new SqliteVectorStore(embedder.embeddings, repo);
  const provider = new FakeProvider(answer);
  const queue = new TaskQueue();
  const deps: Dependencies = {
    config,
    repo,
    secret: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    queue,
    getEmbedder: () => embedder,
    getStore: () => store,
    getSettings: () => readSettings(repo),
    resolveProvider: () => provider,
    createIndexer: () => new Indexer({ repo, store, embedder, embeddingModel: "fake-embed" }),
    ragDeps: (): RagDeps => ({
      provider,
      store,
      embedder,
      repo,
      settings: readSettings(repo),
    }),
    healthCheck: async () => ({ reachable: true, models: ["fake-chat"] }),
    reloadRuntime: async () => undefined,
  };
  return { config, db, repo, store, embedder, provider, deps };
}
