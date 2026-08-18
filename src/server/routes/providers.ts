import { Router } from "express";
import { z } from "zod";
import type { Dependencies } from "../app";
import { encryptSecret } from "../llm/crypto";

const ProviderBody = z.object({
  name: z.string().min(1).max(100),
  kind: z.enum(["ollama", "openai-compatible"]),
  baseUrl: z.string().min(1).max(500),
  model: z.string().min(1).max(200),
  apiKey: z.string().max(2000).optional(),
  temperature: z.number().min(0).max(2),
  numCtx: z.number().int().min(256).max(262144),
  think: z.boolean(),
  topK: z.number().int().min(0).max(100),
  isActive: z.boolean(),
});

function toPublic(row: ReturnType<Dependencies["repo"]["getProvider"]> & object, hasApiKey: boolean) {
  if (!row) return null;
  const r = row as { id: number; name: string; kind: string; base_url: string; model: string; temperature: number; num_ctx: number; think: number; top_k: number; is_active: number; api_key_enc: string | null; created_at: string; updated_at: string };
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    baseUrl: r.base_url,
    model: r.model,
    temperature: r.temperature,
    numCtx: r.num_ctx,
    think: r.think === 1,
    topK: r.top_k,
    isActive: r.is_active === 1,
    hasApiKey,
    apiKeyMasked: hasApiKey ? "••••" + (r.api_key_enc?.slice(-8) ?? "") : undefined,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function providersRouter(deps: Dependencies): Router {
  const r = Router();
  const secret = deps.secret;

  r.get("/", (_req, res) => {
    const rows = deps.repo.listProviders();
    res.json({ providers: rows.map((row) => toPublic(row, !!row.api_key_enc)) });
  });

  r.post("/", (req, res) => {
    const parsed = ProviderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "参数错误：" + parsed.error.issues.map((i) => i.message).join("；") });
      return;
    }
    const b = parsed.data;
    if (b.kind === "openai-compatible" && !b.apiKey) {
      res.status(400).json({ error: "OpenAI 兼容 Provider 需要填写 API Key" });
      return;
    }
    const id = deps.repo.insertProvider({
      name: b.name,
      kind: b.kind,
      baseUrl: b.baseUrl,
      apiKeyEnc: b.apiKey ? encryptSecret(b.apiKey, secret) : null,
      model: b.model,
      temperature: b.temperature,
      numCtx: b.numCtx,
      think: b.think,
      topK: b.topK,
      isActive: b.isActive,
    });
    if (b.isActive) deps.repo.setActiveProvider(id);
    res.json({ ok: true, id });
  });

  r.put("/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = deps.repo.getProvider(id);
    if (!row) {
      res.status(404).json({ error: "Provider 不存在" });
      return;
    }
    const parsed = ProviderBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "参数错误：" + parsed.error.issues.map((i) => i.message).join("；") });
      return;
    }
    const b = parsed.data;
    if (b.kind === "openai-compatible" && !b.apiKey && !row.api_key_enc) {
      res.status(400).json({ error: "OpenAI 兼容 Provider 需要填写 API Key" });
      return;
    }
    deps.repo.updateProvider(id, {
      name: b.name,
      baseUrl: b.baseUrl,
      model: b.model,
      temperature: b.temperature,
      numCtx: b.numCtx,
      think: b.think,
      topK: b.topK,
      isActive: b.isActive,
      apiKeyEnc: b.apiKey ? encryptSecret(b.apiKey, secret) : row.api_key_enc,
    });
    if (b.isActive) deps.repo.setActiveProvider(id);
    res.json({ ok: true });
  });

  r.delete("/:id", (req, res) => {
    const id = Number(req.params.id);
    const row = deps.repo.getProvider(id);
    if (!row) {
      res.status(404).json({ error: "Provider 不存在" });
      return;
    }
    if (row.is_active === 1) {
      res.status(400).json({ error: "不能删除当前使用的模型，请先切换其他模型" });
      return;
    }
    deps.repo.deleteProvider(id);
    res.json({ ok: true });
  });

  r.post("/:id/test", async (req, res) => {
    const id = Number(req.params.id);
    const provider = deps.resolveProvider(id);
    if (!provider) {
      res.status(404).json({ error: "Provider 不存在" });
      return;
    }
    const result = await provider.testConnection();
    res.json(result);
  });

  r.post("/:id/activate", (req, res) => {
    const id = Number(req.params.id);
    if (!deps.repo.getProvider(id)) {
      res.status(404).json({ error: "Provider 不存在" });
      return;
    }
    deps.repo.setActiveProvider(id);
    res.json({ ok: true });
  });

  return r;
}
