import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import type { SqliteVectorStore } from "./vectorStore";
import type { SourceRef } from "../../shared/types";

export interface RetrieveOptions {
  topK: number;
  threshold: number;
  includeCases: boolean;
}

export interface RetrieveResult {
  sources: SourceRef[];
  lowConfidence: boolean;
}

export async function retrieve(
  query: string,
  store: SqliteVectorStore,
  embeddings: EmbeddingsInterface,
  opts: RetrieveOptions
): Promise<RetrieveResult> {
  const qv = await embeddings.embedQuery(query);
  const filter = opts.includeCases ? undefined : { type: "rules" };
  const results = await store.similaritySearchVectorWithScore(qv, Math.max(opts.topK, 3), filter);

  let hits = results.filter(([, s]) => s >= opts.threshold);
  let lowConfidence = false;
  if (hits.length === 0 && results.length > 0) {
    hits = results.slice(0, 1); // 无命中时降级取最相关一条并标记低置信
    lowConfidence = true;
  }

  const sources: SourceRef[] = hits.map(([doc, score]) => {
    const m = doc.metadata as Record<string, unknown>;
    return {
      chunkId: Number(m.chunkId),
      docId: Number(m.docId),
      docName: String(m.docName),
      type: (m.docType as SourceRef["type"]) ?? "other",
      ruleNo: m.ruleNo as string | undefined,
      chapter: m.chapter as string | undefined,
      page: m.page as number | undefined,
      score,
      excerpt: doc.pageContent.slice(0, 300),
    };
  });
  return { sources, lowConfidence };
}
