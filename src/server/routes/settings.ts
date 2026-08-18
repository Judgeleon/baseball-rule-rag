import { Router } from "express";
import { z } from "zod";
import type { Dependencies } from "../app";
import { readSettings } from "../settings";

const SettingsBody = z.object({
  embeddingBaseUrl: z.string().min(1).max(500),
  embeddingModel: z.string().min(1).max(200),
  embeddingDimensions: z.number().int().min(8).max(8192),
  embeddingBatch: z.number().int().min(1).max(256),
  retrieveTopK: z.number().int().min(1).max(50),
  scoreThreshold: z.number().min(-1).max(1),
  includeCases: z.boolean(),
  maxHistoryTurns: z.number().int().min(0).max(30),
  systemPrompt: z.string().max(20000),
  welcomeMessage: z.string().max(2000),
});

export function settingsRouter(deps: Dependencies): Router {
  const r = Router();

  r.get("/", (_req, res) => {
    res.json({ settings: readSettings(deps.repo) });
  });

  r.put("/", (req, res) => {
    const parsed = SettingsBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "参数错误：" + parsed.error.issues.map((i) => i.message).join("；") });
      return;
    }
    const s = parsed.data;
    deps.repo.setSetting("embedding_base_url", s.embeddingBaseUrl);
    deps.repo.setSetting("embedding_model", s.embeddingModel);
    deps.repo.setSetting("embedding_dimensions", String(s.embeddingDimensions));
    deps.repo.setSetting("embedding_batch", String(s.embeddingBatch));
    deps.repo.setSetting("retrieve_top_k", String(s.retrieveTopK));
    deps.repo.setSetting("score_threshold", String(s.scoreThreshold));
    deps.repo.setSetting("include_cases", s.includeCases ? "1" : "0");
    deps.repo.setSetting("max_history_turns", String(s.maxHistoryTurns));
    deps.repo.setSetting("system_prompt", s.systemPrompt);
    deps.repo.setSetting("welcome_message", s.welcomeMessage);
    deps.reloadRuntime(); // 嵌入配置变更后重建运行时组件
    res.json({ ok: true });
  });

  return r;
}
