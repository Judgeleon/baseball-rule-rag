import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { AppConfig } from "../config";

const MIGRATIONS: string[] = [
  `CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    stored_path TEXT NOT NULL,
    mime TEXT,
    size_bytes INTEGER,
    type TEXT NOT NULL DEFAULT 'case' CHECK(type IN ('rules','case','other')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','parsing','indexing','indexed','failed')),
    sha256 TEXT,
    chunk_count INTEGER DEFAULT 0,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL,
    content TEXT NOT NULL,
    rule_no TEXT,
    chapter TEXT,
    page INTEGER,
    embedding BLOB NOT NULL,
    embedding_model TEXT NOT NULL,
    UNIQUE(doc_id, seq)
  );`,
  `CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);`,
  `CREATE TABLE IF NOT EXISTS providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('ollama','openai-compatible')),
    base_url TEXT NOT NULL DEFAULT '',
    api_key_enc TEXT,
    model TEXT NOT NULL,
    temperature REAL NOT NULL DEFAULT 0.2,
    num_ctx INTEGER NOT NULL DEFAULT 8192,
    think INTEGER NOT NULL DEFAULT 1,
    top_k INTEGER NOT NULL DEFAULT 6,
    extra TEXT NOT NULL DEFAULT '{}',
    is_active INTEGER NOT NULL DEFAULT 0,
    sort INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    content TEXT NOT NULL,
    sources_json TEXT,
    created_at TEXT NOT NULL
  );`,
  `CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, id);`,
  `CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`,
];

export type Db = Database.Database;

export function openDb(cfg: AppConfig): Db {
  if (cfg.dbPath !== ":memory:") {
    mkdirSync(dirname(cfg.dbPath), { recursive: true });
  }
  const db = new Database(cfg.dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  for (const sql of MIGRATIONS) db.exec(sql);
  return db;
}
