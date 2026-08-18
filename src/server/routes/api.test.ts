import { describe, expect, it, beforeEach } from "vitest";
import request from "supertest";
import type { AddressInfo } from "node:net";
import { buildTestContext, type TestContext } from "../testing/fakes";
import { createApp } from "../app";
import { join } from "node:path";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";

/** 用原生 fetch 读取 SSE（superagent 对流式响应支持不佳） */
async function postSse(
  app: ReturnType<typeof createApp>,
  body: Record<string, unknown>
): Promise<{ status: number; text: string }> {
  const server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", () => resolve()));
  const port = (server.address() as AddressInfo).port;
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: res.status, text: await res.text() };
  } finally {
    server.close();
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

describe("HTTP API", () => {
  let ctx: TestContext;
  let app: ReturnType<typeof createApp>;

  beforeEach(async () => {
    ctx = buildTestContext();
    await ctx.store.loadFromDb();
    app = createApp(ctx.deps);
  });

  it("GET /api/health 返回服务状态", async () => {
    const res = await request(app).get("/api/health");
    expect(res.status).toBe(200);
    expect(res.body.ollama.reachable).toBe(true);
    expect(res.body.db.documents).toBe(0);
    expect(res.body.embeddingModel).toBe("fake-embed");
  });

  it("上传 txt → 索引进度 → 列表可见 → 可检索", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wiki-test-"));
    const file = join(dir, "案例-投手犯规.txt");
    writeFileSync(file, "案例：投手在投球时犯规的判罚说明。\n规则 5.07 投手犯规相关条文。");

    const upload = await request(app)
      .post("/api/documents")
      .attach("files", file)
      .field("type", "case");
    expect(upload.status).toBe(200);
    expect(upload.body.accepted).toHaveLength(1);
    const docId = upload.body.accepted[0].id as number;

    // 等待后台索引队列完成
    let status = "";
    for (let i = 0; i < 50; i++) {
      await wait(100);
      const doc = ctx.repo.getDocument(docId);
      status = doc?.status ?? "";
      if (status === "indexed" || status === "failed") break;
    }
    expect(status).toBe("indexed");

    const list = await request(app).get("/api/documents");
    expect(list.status).toBe(200);
    expect(list.body.documents[0].chunkCount).toBeGreaterThan(0);

    // 聊天 SSE（用原生 fetch 读取流）
    const chat = await postSse(app, { question: "投手犯规如何判罚？" });
    expect(chat.status).toBe(200);
    expect(chat.text).toContain("event: sources");
    expect(chat.text).toContain("event: delta");
    expect(chat.text).toContain("event: done");
  });

  it("知识库为空时聊天返回友好错误", async () => {
    const chat = await request(app)
      .post("/api/chat/stream")
      .send({ question: "任意问题" });
    expect(chat.status).toBe(400);
    expect(chat.body.error).toContain("知识库为空");
  });

  it("删除文档后分块被移除", async () => {
    const dir = mkdtempSync(join(tmpdir(), "wiki-test-"));
    const file = join(dir, "test.txt");
    writeFileSync(file, "这是一段测试内容。".repeat(50));
    const upload = await request(app).post("/api/documents").attach("files", file);
    const docId = upload.body.accepted[0].id as number;
    for (let i = 0; i < 50; i++) {
      await wait(100);
      if (ctx.repo.getDocument(docId)?.status === "indexed") break;
    }
    expect(ctx.store.count()).toBeGreaterThan(0);
    const del = await request(app).delete("/api/documents/" + docId);
    expect(del.status).toBe(200);
    await wait(300);
    expect(ctx.repo.getDocument(docId)).toBeUndefined();
    expect(ctx.store.count()).toBe(0);
  });

  it("Provider CRUD 与 Key 掩码", async () => {
    const created = await request(app)
      .post("/api/providers")
      .send({
        name: "DeepSeek",
        kind: "openai-compatible",
        baseUrl: "https://api.deepseek.com",
        model: "deepseek-chat",
        apiKey: "sk-test-123456",
        temperature: 0.2,
        numCtx: 8192,
        think: false,
        topK: 6,
        isActive: false,
      });
    expect(created.status).toBe(200);
    const list = await request(app).get("/api/providers");
    const ds = list.body.providers.find((p: { name: string }) => p.name === "DeepSeek");
    expect(ds).toBeDefined();
    expect(ds.hasApiKey).toBe(true);
    expect(ds.apiKey).toBeUndefined();
    expect(ds.apiKeyMasked).toContain("••••");
    // Key 被加密存储
    const row = ctx.repo.getProvider(ds.id);
    expect(row!.api_key_enc).not.toContain("sk-test-123456");
    // 删除
    const del = await request(app).delete("/api/providers/" + ds.id);
    expect(del.status).toBe(200);
  });

  it("设置读写", async () => {
    const res = await request(app).get("/api/settings");
    expect(res.status).toBe(200);
    const s = res.body.settings;
    const put = await request(app).put("/api/settings").send({ ...s, retrieveTopK: 8, scoreThreshold: 0.4 });
    expect(put.status).toBe(200);
    const after = await request(app).get("/api/settings");
    expect(after.body.settings.retrieveTopK).toBe(8);
    expect(after.body.settings.scoreThreshold).toBe(0.4);
  });
});
