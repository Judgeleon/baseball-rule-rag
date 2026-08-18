import { Router } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { Dependencies } from "../app";
import { setupSse, writeSse } from "../sse";
import { runRag } from "../retrieval/rag";

const ChatBody = z.object({
  question: z.string().min(1, "问题不能为空").max(20000),
  conversationId: z.string().min(1).max(128).optional(),
  providerId: z.number().int().positive().optional(),
  topK: z.number().int().min(1).max(50).optional(),
  threshold: z.number().min(-1).max(1).optional(),
});

export function chatRouter(deps: Dependencies): Router {
  const r = Router();
  r.post("/stream", async (req, res) => {
    const parsed = ChatBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "参数错误：" + parsed.error.issues.map((i) => i.message).join("；") });
      return;
    }
    const { question, topK, threshold } = parsed.data;
    const conversationId = parsed.data.conversationId || randomUUID();
    const provider = deps.resolveProvider(parsed.data.providerId);
    if (!provider) {
      res.status(400).json({ error: "未配置可用的模型 Provider，请先到“模型设置”中配置并设为当前模型。" });
      return;
    }
    if (deps.getStore().count() === 0) {
      res.status(400).json({ error: "知识库为空：请先在“知识库”页上传规则文件或案例，等待索引完成后再提问。" });
      return;
    }
    const history = deps.repo.messagesByConversation(conversationId, 50).map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      createdAt: r.created_at,
    }));
    setupSse(res);
    const abort = new AbortController();
    // 注意：req 的 close 事件在请求体读取完成后即触发，应监听 res 的 close（客户端断开）
    res.on("close", () => abort.abort());
    try {
      for await (const ev of runRag({ question, conversationId, history, topK, threshold, signal: abort.signal }, deps.ragDeps())) {
        if (res.writableEnded) break;
        writeSse(res, ev.type, ev);
        if (ev.type === "done") break;
      }
      res.end();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!res.writableEnded) {
        writeSse(res, "error", { message: msg });
        res.end();
      }
    }
  });
  return r;
}
