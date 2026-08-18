import express from "express";
import type { NextFunction, Request, Response } from "express";
import cors from "cors";
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Repo } from "./db/repo";
import type { EmbedderLike } from "./ingestion/embed";
import type { SqliteVectorStore } from "./retrieval/vectorStore";
import type { Indexer } from "./ingestion/indexer";
import type { TaskQueue } from "./ingestion/indexer";
import type { AppConfig } from "./config";
import type { IChatProvider } from "./llm/types";
import type { RagDeps } from "./retrieval/rag";
import type { Settings, ChatMessage } from "../shared/types";
import { healthRouter } from "./routes/health";
import { chatRouter } from "./routes/chat";
import { documentsRouter } from "./routes/documents";
import { providersRouter } from "./routes/providers";
import { settingsRouter } from "./routes/settings";

export interface HealthResult {
  reachable: boolean;
  version?: string;
  models?: string[];
  error?: string;
}

export interface Dependencies {
  config: AppConfig;
  repo: Repo;
  secret: string;
  getEmbedder(): EmbedderLike;
  getStore(): SqliteVectorStore;
  getSettings(): Settings;
  queue: TaskQueue;
  resolveProvider(id?: number): IChatProvider | null;
  ragDeps(): RagDeps;
  createIndexer(): Indexer;
  healthCheck(): Promise<HealthResult>;
  reloadRuntime(): Promise<void>;
}

export function createApp(deps: Dependencies): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "5mb" }));

  app.use("/api/health", healthRouter(deps));
  app.use("/api/chat", chatRouter(deps));
  app.use("/api/documents", documentsRouter(deps));
  app.use("/api/providers", providersRouter(deps));
  app.use("/api/settings", settingsRouter(deps));

  app.get("/api/conversations/:conversationId/messages", (req, res) => {
    const rows = deps.repo.messagesByConversation(req.params.conversationId, 100);
    const messages: ChatMessage[] = rows.map((r) => ({
      id: r.id,
      conversationId: r.conversation_id,
      role: r.role,
      content: r.content,
      sources: r.sources_json ? JSON.parse(r.sources_json) : undefined,
      createdAt: r.created_at,
    }));
    res.json({ messages });
  });

  // 生产模式：托管前端构建产物
  const clientDir = join(process.cwd(), "dist", "client");
  if (existsSync(clientDir)) {
    app.use(express.static(clientDir));
    app.use((req, res, next) => {
      if (req.method === "GET" && !req.path.startsWith("/api")) {
        res.sendFile(join(clientDir, "index.html"));
        return;
      }
      next();
    });
  }

  // 统一错误处理
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    console.error("[server error]", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err instanceof Error ? err.message : "服务器内部错误" });
    }
  });

  return app;
}
