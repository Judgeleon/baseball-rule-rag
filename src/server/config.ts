import "dotenv/config";
import { mkdirSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { randomBytes } from "node:crypto";

function int(v: string | undefined, def: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export interface AppConfig {
  port: number;
  host: string;
  dataDir: string;      // 相对项目根目录
  dataDirAbs: string;
  dbPath: string;       // ":memory:" 表示内存库（测试用）
  uploadsDir: string;
  ollamaBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  defaultChatModel: string;
}

function rootDir(): string {
  // scripts/ 与 src/server/ 下运行时，项目根为进程 cwd（npm scripts 均在根目录执行）
  return process.cwd();
}

export function loadConfig(): AppConfig {
  const root = rootDir();
  const dataDir = process.env.DATA_DIR || "data";
  const dataDirAbs = resolve(root, dataDir);
  const dbPath = dataDir === ":memory:" ? ":memory:" : join(dataDirAbs, "wiki.db");
  const uploadsDir = dataDir === ":memory:" ? join(root, ".tmp-uploads") : join(dataDirAbs, "uploads");
  if (dataDir !== ":memory:") {
    mkdirSync(dataDirAbs, { recursive: true });
  }
  mkdirSync(uploadsDir, { recursive: true });
  return {
    port: int(process.env.PORT, 3000),
    host: process.env.HOST || "0.0.0.0",
    dataDir,
    dataDirAbs,
    dbPath,
    uploadsDir,
    ollamaBaseUrl: (process.env.OLLAMA_BASE_URL || "http://192.168.5.19:11434").replace(/\/$/, ""),
    embeddingModel: process.env.EMBEDDING_MODEL || "qwen3-embedding:4b",
    embeddingDimensions: int(process.env.EMBEDDING_DIMENSIONS, 2560),
    defaultChatModel: process.env.DEFAULT_CHAT_MODEL || "qwen3.5:9b",
  };
}

// ---- 本地密钥（用于加密 API Key）----
export function getSecret(cfg: AppConfig): string {
  if (process.env.SECRET) return process.env.SECRET;
  const p = join(cfg.dataDirAbs, ".secret");
  if (cfg.dbPath !== ":memory:" && existsSync(p)) {
    return readFileSync(p, "utf8").trim();
  }
  const secret = randomBytes(32).toString("hex");
  if (cfg.dbPath !== ":memory:") {
    writeFileSync(p, secret, { mode: 0o600 });
  }
  return secret;
}
