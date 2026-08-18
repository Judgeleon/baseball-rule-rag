import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { Repo, ChunkRow } from "../db/repo";

export interface VectorItem {
  chunkId: number;
  docId: number;
  seq: number;
  docName: string;
  docType: string;
  ruleNo?: string;
  chapter?: string;
  page?: number;
  content: string;
  vector: Float32Array;
}

export function decodeEmbedding(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

export function encodeEmbedding(vec: ArrayLike<number>): Buffer {
  const b = Buffer.allocUnsafe(vec.length * 4);
  for (let i = 0; i < vec.length; i++) b.writeFloatLE(vec[i], i * 4);
  return b;
}

type SqliteFilter = { docId?: number; type?: string };

/** SQLite 持久化 + 内存余弦检索的 LangChain VectorStore 实现 */
export class SqliteVectorStore extends VectorStore {
  FilterType = {} as SqliteFilter;
  private items: VectorItem[] = [];
  private norms: Float32Array = new Float32Array(0);

  constructor(embeddings: EmbeddingsInterface, private repo: Repo) {
    super(embeddings, {});
  }

  _vectorstoreType(): string {
    return "sqlite-cosine";
  }

  count(): number {
    return this.items.length;
  }

  async loadFromDb(): Promise<void> {
    const rows = this.repo.allChunks() as unknown as (ChunkRow & { doc_name: string; doc_type: string })[];
    this.items = rows.map((r) => ({
      chunkId: r.id,
      docId: r.doc_id,
      seq: r.seq,
      docName: r.doc_name,
      docType: r.doc_type,
      ruleNo: r.rule_no ?? undefined,
      chapter: r.chapter ?? undefined,
      page: r.page ?? undefined,
      content: r.content,
      vector: decodeEmbedding(r.embedding),
    }));
    this.recomputeNorms();
  }

  private recomputeNorms(): void {
    this.norms = new Float32Array(this.items.length);
    for (let i = 0; i < this.items.length; i++) {
      let s = 0;
      const v = this.items[i].vector;
      for (let j = 0; j < v.length; j++) s += v[j] * v[j];
      this.norms[i] = Math.sqrt(s) || 1;
    }
  }

  async addVectors(vectors: number[][], documents: Document[]): Promise<string[]> {
    for (let i = 0; i < documents.length; i++) {
      const meta = documents[i].metadata as Record<string, unknown>;
      this.items.push({
        chunkId: Number(meta.chunkId ?? 0),
        docId: Number(meta.docId ?? 0),
        seq: Number(meta.seq ?? 0),
        docName: String(meta.docName ?? ""),
        docType: String(meta.docType ?? "other"),
        ruleNo: meta.ruleNo as string | undefined,
        chapter: meta.chapter as string | undefined,
        page: meta.page as number | undefined,
        content: documents[i].pageContent,
        vector: new Float32Array(vectors[i]),
      });
    }
    this.recomputeNorms();
    return documents.map(() => "");
  }

  async addDocuments(documents: Document[]): Promise<string[]> {
    const vectors = await this.embeddings.embedDocuments(documents.map((d) => d.pageContent));
    return this.addVectors(vectors, documents);
  }

  async deleteByDoc(docId: number): Promise<void> {
    this.items = this.items.filter((i) => i.docId !== docId);
    this.recomputeNorms();
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    filter?: SqliteFilter
  ): Promise<[Document, number][]> {
    const q = new Float32Array(query);
    let qn = 0;
    for (let i = 0; i < q.length; i++) qn += q[i] * q[i];
    qn = Math.sqrt(qn) || 1;

    const scored: { item: VectorItem; score: number }[] = [];
    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (filter?.docId !== undefined && item.docId !== filter.docId) continue;
      if (filter?.type !== undefined && item.docType !== filter.type) continue;
      let dot = 0;
      const v = item.vector;
      for (let j = 0; j < v.length; j++) dot += q[j] * v[j];
      scored.push({ item, score: dot / (qn * this.norms[i]) });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k).map(({ item, score }) => [this.toDocument(item), score] as [Document, number]);
  }

  private toDocument(item: VectorItem): Document {
    return new Document({
      pageContent: item.content,
      metadata: {
        chunkId: item.chunkId,
        docId: item.docId,
        seq: item.seq,
        docName: item.docName,
        docType: item.docType,
        ruleNo: item.ruleNo,
        chapter: item.chapter,
        page: item.page,
      },
    });
  }
}
