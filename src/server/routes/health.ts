import { Router } from "express";
import type { Dependencies } from "../app";

export function healthRouter(deps: Dependencies): Router {
  const r = Router();
  r.get("/", async (_req, res) => {
    const ollama = await deps.healthCheck();
    const db = {
      documents: deps.repo.countDocuments(),
      chunks: deps.repo.countChunks(),
      indexedDocs: deps.repo.countIndexedDocs(),
    };
    const active = deps.repo.getActiveProvider();
    res.json({
      ok: ollama.reachable && db.chunks > 0,
      ollama,
      db,
      embeddingModel: deps.getEmbedder().model,
      embeddingDimensions: deps.getEmbedder().dimensions,
      activeProvider: active
        ? { name: active.name, model: active.model, kind: active.kind }
        : null,
    });
  });
  return r;
}
