// 离线索引 docs/ 目录下的规则文件（或命令行传入的任意文件）
// 用法: npm run index:docs -- [--force] [file...]
import { loadConfig, getSecret } from "../src/server/config";
import { openDb } from "../src/server/db/connection";
import { seedDefaults } from "../src/server/db/seed";
import { Repo } from "../src/server/db/repo";
import { Embedder } from "../src/server/ingestion/embed";
import { SqliteVectorStore } from "../src/server/retrieval/vectorStore";
import { Indexer } from "../src/server/ingestion/indexer";
import { readSettings } from "../src/server/settings";
import { readdirSync } from "node:fs";
import { copyFileSync } from "node:fs";
import { join, basename } from "node:path";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

const SUPPORTED = [".pdf", ".txt", ".md", ".docx"];
function mimeOf(name: string): string {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.docx$/i.test(name)) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (/\.md$/i.test(name)) return "text/markdown";
  return "text/plain";
}
function typeOf(name: string): "rules" | "case" | "other" {
  if (/\.pdf$/i.test(name)) return /规则/.test(name) ? "rules" : "other";
  return "case";
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const targets = args.filter((a) => !a.startsWith("--"));
  const config = loadConfig();
  const db = openDb(config);
  seedDefaults(db, config);
  const repo = new Repo(db);
  const secret = getSecret(config);
  const settings = readSettings(repo);
  const embedder = new Embedder({
    baseUrl: settings.embeddingBaseUrl,
    model: settings.embeddingModel,
    dimensions: settings.embeddingDimensions,
    batchSize: settings.embeddingBatch,
  });
  const store = new SqliteVectorStore(embedder.embeddings, repo);
  await store.loadFromDb();
  const indexer = new Indexer({ repo, store, embedder, embeddingModel: settings.embeddingModel });

  const docsDir = join(process.cwd(), "docs");
  let files: string[] = targets.length
    ? targets
    : readdirSync(docsDir).filter((f) => SUPPORTED.some((e) => f.toLowerCase().endsWith(e)));

  for (const f of files) {
    const srcPath = join(docsDir, f);
    const ext = f.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "bin";
    const storedName = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const storedPath = join(config.uploadsDir, storedName);
    copyFileSync(srcPath, storedPath);
    const sha = createHash("sha256").update(readFileSync(srcPath)).digest("hex");
    const existing = repo.findBySha256(sha);
    let docId: number;
    if (existing && !force) {
      console.log(`[跳过] ${f} 已入库（doc#${existing.id}，${existing.chunk_count} 块）`);
      continue;
    }
    if (existing) {
      docId = existing.id;
    } else {
      docId = repo.insertDocument({ name: f, storedPath: storedName, mime: mimeOf(f), sizeBytes: 0, type: typeOf(f), sha256: sha });
    }
    const t0 = Date.now();
    const result = await indexer.indexFile(docId, storedPath, mimeOf(f), (p) => {
      process.stdout.write(`\r  ${f} 嵌入 ${p.done}/${p.total}`);
    });
    console.log(`\n[完成] ${f}: ${result.chunkCount} 块 / ${result.pages} 页 / ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
  console.log(`\n知识库总计: ${store.count()} 块`);
  process.exit(0);
}

main().catch((e) => {
  console.error("失败:", e);
  process.exit(1);
});
