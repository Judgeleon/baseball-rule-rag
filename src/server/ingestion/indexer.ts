import type { Repo } from "../db/repo";
import type { SqliteVectorStore } from "../retrieval/vectorStore";
import type { EmbedderLike } from "./embed";
import { parseFile } from "./parse";
import { splitRulesText } from "./split";
import { encodeEmbedding } from "../retrieval/vectorStore";

export interface IndexProgress {
  phase: "parsing" | "embedding";
  done: number;
  total: number;
}

export class Indexer {
  constructor(private deps: { repo: Repo; store: SqliteVectorStore; embedder: EmbedderLike; embeddingModel: string }) {}

  async indexFile(
    docId: number,
    filePath: string,
    mime: string,
    onProgress?: (p: IndexProgress) => void
  ): Promise<{ chunkCount: number; pages: number }> {
    const repo = this.deps.repo;
    repo.updateDoc(docId, { status: "parsing", error: null });
    const parsed = await parseFile(filePath, mime);
    repo.updateDoc(docId, { status: "indexing" });
    const chunks = await splitRulesText(parsed.text);
    const texts = chunks.map((c) => c.content);
    const vectors = await this.deps.embedder.embed(texts, (done, total) =>
      onProgress?.({ phase: "embedding", done, total })
    );
    repo.deleteChunksByDoc(docId);
    repo.transaction(() => {
      chunks.forEach((c, i) => {
        repo.insertChunk({
          docId,
          seq: i,
          content: c.content,
          ruleNo: c.ruleNo,
          chapter: c.chapter,
          page: c.page,
          embedding: encodeEmbedding(vectors[i]),
          embeddingModel: this.deps.embeddingModel,
        });
      });
    });
    repo.updateDoc(docId, { status: "indexed", chunkCount: chunks.length });
    await this.deps.store.loadFromDb();
    return { chunkCount: chunks.length, pages: parsed.pages };
  }

  async deleteDocument(docId: number): Promise<void> {
    this.deps.repo.deleteChunksByDoc(docId);
    this.deps.repo.deleteDocument(docId);
    await this.deps.store.loadFromDb();
  }
}

/** 进程内互斥：串行化并发的索引任务 */
export class TaskQueue {
  private chain: Promise<unknown> = Promise.resolve();
  enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(fn, fn);
    this.chain = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  }
}
