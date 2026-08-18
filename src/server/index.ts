import { loadConfig, getSecret } from "./config";
import { openDb } from "./db/connection";
import { seedDefaults } from "./db/seed";
import { Repo } from "./db/repo";
import { Embedder } from "./ingestion/embed";
import { SqliteVectorStore } from "./retrieval/vectorStore";
import { Indexer, TaskQueue } from "./ingestion/indexer";
import { readSettings } from "./settings";
import { resolveActiveProvider, resolveProvider } from "./llm/factory";
import { createApp, type Dependencies } from "./app";
import type { Settings } from "../shared/types";
import { readdirSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { join } from "node:path";
import type { DocType } from "../shared/types";

const SUPPORTED_EXTS = [".pdf", ".txt", ".md", ".docx"];

function mimeOf(name: string): string {
  if (/.pdf$/i.test(name)) return "application/pdf";
  if (/.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/.md$/i.test(name)) return "text/markdown";
  return "text/plain";
}

function typeOf(name: string): DocType {
  if (/.pdf$/i.test(name)) return /规则/.test(name) ? "rules" : "other";
  return "case";
}

async function main(): Promise<void> {
  const config = loadConfig();
  const db = openDb(config);
  seedDefaults(db, config);
  const repo = new Repo(db);
  const secret = getSecret(config);
  const queue = new TaskQueue();

  let settings: Settings = readSettings(repo);
  let embedder = new Embedder({
    baseUrl: settings.embeddingBaseUrl,
    model: settings.embeddingModel,
    dimensions: settings.embeddingDimensions,
    batchSize: settings.embeddingBatch,
  });
  let store = new SqliteVectorStore(embedder.embeddings, repo);
  await store.loadFromDb();

  const deps: Dependencies = {
    config,
    repo,
    secret,
    queue,
    getEmbedder: () => embedder,
    getStore: () => store,
    getSettings: () => readSettings(repo),
    resolveProvider: (id?: number) => resolveProvider(repo, secret, id),
    createIndexer: () => new Indexer({ repo, store, embedder, embeddingModel: settings.embeddingModel }),
    ragDeps: () => ({
      provider: resolveActiveProvider(repo, secret)!,
      store,
      embedder,
      repo,
      settings: readSettings(repo),
    }),
    healthCheck: async () => {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 3000);
        const res = await fetch(joinUrl(settings.embeddingBaseUrl, "/api/tags"), { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) return { reachable: false, error: "HTTP " + res.status };
        const json = (await res.json()) as { models?: { name: string }[] };
        return { reachable: true, models: (json.models ?? []).map((m) => m.name) };
      } catch (e) {
        return { reachable: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
    reloadRuntime: async () => {
      settings = readSettings(repo);
      embedder = new Embedder({
        baseUrl: settings.embeddingBaseUrl,
        model: settings.embeddingModel,
        dimensions: settings.embeddingDimensions,
        batchSize: settings.embeddingBatch,
      });
      store = new SqliteVectorStore(embedder.embeddings, repo);
      await store.loadFromDb();
    },
  };

  const app = createApp(deps);
  app.listen(config.port, config.host, () => {
    console.log(`[wiki] 服务已启动: http://${config.host === "0.0.0.0" ? "localhost" : config.host}:${config.port}`);
    console.log(`[wiki] Ollama: ${settings.embeddingBaseUrl} | 嵌入模型: ${settings.embeddingModel} | 知识块: ${store.count()}`);
  });

  // 首次启动：自动索引 docs/ 下的规则文件
  const docsDir = join(process.cwd(), "docs");
  let files: string[] = [];
  try {
    files = readdirSync(docsDir).filter((f) => SUPPORTED_EXTS.some((e) => f.toLowerCase().endsWith(e)));
  } catch {
    files = [];
  }
  if (repo.countDocuments() === 0 && files.length > 0) {
    for (const f of files) {
      const ext = f.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "bin";
      const storedName = `seed-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const storedPath = join(config.uploadsDir, storedName);
      try {
        await copyFile(join(docsDir, f), storedPath);
      } catch (e) {
        console.error(`[wiki] 复制 ${f} 失败: `, e);
        continue;
      }
      const docId = repo.insertDocument({
        name: f,
        storedPath: storedName,
        mime: mimeOf(f),
        sizeBytes: 0,
        type: typeOf(f),
      });
      queue.enqueue(async () => {
        const indexer = deps.createIndexer();
        try {
          await indexer.indexFile(docId, storedPath, mimeOf(f));
          console.log(`[wiki] 已索引 ${f}`);
        } catch (e) {
          repo.updateDoc(docId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
          console.error(`[wiki] 索引失败 ${f}: `, e);
        }
      });
    }
  }
}

function joinUrl(base: string, path: string): string {
  return base.replace(/\/$/, "") + path;
}

main().catch((e) => {
  console.error("[wiki] 启动失败:", e);
  process.exit(1);
});
