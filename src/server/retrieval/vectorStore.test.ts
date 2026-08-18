import { describe, expect, it, beforeEach } from "vitest";
import { buildTestContext } from "../testing/fakes";
import { encodeEmbedding } from "./vectorStore";
import type { TestContext } from "../testing/fakes";

describe("SqliteVectorStore", () => {
  let ctx: TestContext;
  beforeEach(async () => {
    ctx = buildTestContext();
    await ctx.store.loadFromDb();
  });

  it("从 SQLite 加载分块并做余弦检索排序", async () => {
    const { repo, store, embedder } = ctx;
    const docId = repo.insertDocument({ name: "规则.pdf", storedPath: "x.pdf", mime: "application/pdf", sizeBytes: 1, type: "rules" });
    const texts = [
      "规则 5.07 投球姿势的规定",
      "规则 6.01 妨碍行为的规定",
      "某场比赛的案例分析材料",
    ];
    const vectors = await embedder.embed(texts);
    repo.transaction(() => {
      texts.forEach((t, i) => {
        repo.insertChunk({ docId, seq: i, content: t, ruleNo: i === 0 ? "5.07" : i === 1 ? "6.01" : undefined, chapter: "第五章", page: 10 + i, embedding: encodeEmbedding(vectors[i]), embeddingModel: "fake" });
      });
    });
    await store.loadFromDb();
    expect(store.count()).toBe(3);

    const results = await store.similaritySearchVectorWithScore(
      await embedder.embedQuery("投手投球姿势"),
      3
    );
    expect(results.length).toBe(3);
    expect(results[0][0].pageContent).toBe(texts[0]);
    expect(results[0][1]).toBeGreaterThan(0);
  });

  it("支持 metadata 过滤（仅规则类型）", async () => {
    const { repo, store, embedder } = ctx;
    const docRules = repo.insertDocument({ name: "规则.pdf", storedPath: "a.pdf", mime: "application/pdf", sizeBytes: 1, type: "rules" });
    const docCase = repo.insertDocument({ name: "案例.txt", storedPath: "b.txt", mime: "text/plain", sizeBytes: 1, type: "case" });
    const texts = ["投手犯规的规则条文", "投手犯规的判例说明"];
    const vectors = await embedder.embed(texts);
    repo.transaction(() => {
      repo.insertChunk({ docId: docRules, seq: 0, content: texts[0], embedding: encodeEmbedding(vectors[0]), embeddingModel: "fake" });
      repo.insertChunk({ docId: docCase, seq: 0, content: texts[1], embedding: encodeEmbedding(vectors[1]), embeddingModel: "fake" });
    });
    await store.loadFromDb();
    const q = await embedder.embedQuery("投手犯规");
    const rulesOnly = await store.similaritySearchVectorWithScore(q, 5, { type: "rules" });
    expect(rulesOnly.every(([d]) => d.metadata.docType === "rules")).toBe(true);
  });

  it("deleteByDoc 移除该文档全部分块", async () => {
    const { repo, store, embedder } = ctx;
    const docId = repo.insertDocument({ name: "规则.pdf", storedPath: "x.pdf", mime: "application/pdf", sizeBytes: 1, type: "rules" });
    const vectors = await embedder.embed(["内容一", "内容二"]);
    repo.transaction(() => {
      vectors.forEach((v, i) => repo.insertChunk({ docId, seq: i, content: "内容" + (i + 1), embedding: encodeEmbedding(v), embeddingModel: "fake" }));
    });
    await store.loadFromDb();
    expect(store.count()).toBe(2);
    await store.deleteByDoc(docId);
    expect(store.count()).toBe(0);
  });
});
