import type { Db } from "./connection";
import type { DocType, DocStatus } from "../../shared/types";

export interface DocRow {
  id: number; name: string; stored_path: string; mime: string;
  size_bytes: number; type: DocType; status: DocStatus; sha256: string | null;
  chunk_count: number; error: string | null; created_at: string; updated_at: string;
}
export interface ChunkRow {
  id: number; doc_id: number; seq: number; content: string;
  rule_no: string | null; chapter: string | null; page: number | null;
  embedding: Buffer; embedding_model: string;
}
export interface ProviderRow {
  id: number; name: string; kind: "ollama" | "openai-compatible";
  base_url: string; api_key_enc: string | null; model: string;
  temperature: number; num_ctx: number; think: number; top_k: number;
  extra: string; is_active: number; sort: number; created_at: string; updated_at: string;
}
export interface MessageRow {
  id: number; conversation_id: string; role: "user" | "assistant";
  content: string; sources_json: string | null; created_at: string;
}

export class Repo {
  constructor(private db: Db) {}

  // ---------- documents ----------
  listDocuments(): DocRow[] {
    return this.db.prepare("SELECT * FROM documents ORDER BY created_at DESC").all() as DocRow[];
  }
  getDocument(id: number): DocRow | undefined {
    return this.db.prepare("SELECT * FROM documents WHERE id=?").get(id) as DocRow | undefined;
  }
  findBySha256(sha: string): DocRow | undefined {
    return this.db.prepare("SELECT * FROM documents WHERE sha256=?").get(sha) as DocRow | undefined;
  }
  countDocuments(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM documents").get() as { c: number }).c;
  }
  countIndexedDocs(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM documents WHERE status='indexed'").get() as { c: number }).c;
  }
  insertDocument(row: {
    name: string; storedPath: string; mime: string; sizeBytes: number;
    type: DocType; sha256?: string;
  }): number {
    const now = new Date().toISOString();
    const info = this.db.prepare(
      `INSERT INTO documents(name,stored_path,mime,size_bytes,type,status,sha256,chunk_count,error,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?)`
    ).run(row.name, row.storedPath, row.mime, row.sizeBytes, row.type, "pending",
      row.sha256 ?? null, 0, null, now, now);
    return Number(info.lastInsertRowid);
  }
  updateDoc(id: number, patch: Partial<{ status: DocStatus; error: string | null; chunkCount: number }>): void {
    const fields: string[] = [];
    const vals: unknown[] = [];
    if (patch.status !== undefined) { fields.push("status=?"); vals.push(patch.status); }
    if (patch.error !== undefined) { fields.push("error=?"); vals.push(patch.error); }
    if (patch.chunkCount !== undefined) { fields.push("chunk_count=?"); vals.push(patch.chunkCount); }
    if (!fields.length) return;
    fields.push("updated_at=?");
    vals.push(new Date().toISOString(), id);
    this.db.prepare(`UPDATE documents SET ${fields.join(",")} WHERE id=?`).run(...vals);
  }
  deleteDocument(id: number): void {
    this.db.prepare("DELETE FROM documents WHERE id=?").run(id);
  }

  // ---------- chunks ----------
  insertChunk(row: {
    docId: number; seq: number; content: string;
    ruleNo?: string; chapter?: string; page?: number;
    embedding: Buffer; embeddingModel: string;
  }): void {
    this.db.prepare(
      `INSERT OR REPLACE INTO chunks(doc_id,seq,content,rule_no,chapter,page,embedding,embedding_model)
       VALUES(?,?,?,?,?,?,?,?)`
    ).run(row.docId, row.seq, row.content, row.ruleNo ?? null, row.chapter ?? null,
      row.page ?? null, row.embedding, row.embeddingModel);
  }
  deleteChunksByDoc(docId: number): void {
    this.db.prepare("DELETE FROM chunks WHERE doc_id=?").run(docId);
  }
  countChunks(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM chunks").get() as { c: number }).c;
  }
  allChunks(): ChunkRow[] {
    return this.db.prepare(
      `SELECT c.*, d.name AS doc_name, d.type AS doc_type FROM chunks c JOIN documents d ON d.id=c.doc_id ORDER BY c.doc_id, c.seq`
    ).all() as ChunkRow[] & Array<{ doc_name: string; doc_type: string }>;
  }
  chunksByDoc(docId: number): ChunkRow[] {
    return this.db.prepare("SELECT * FROM chunks WHERE doc_id=? ORDER BY seq").all(docId) as ChunkRow[];
  }
  getChunk(id: number): ChunkRow | undefined {
    return this.db.prepare("SELECT * FROM chunks WHERE id=?").get(id) as ChunkRow | undefined;
  }
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }

  // ---------- providers ----------
  listProviders(): ProviderRow[] {
    return this.db.prepare("SELECT * FROM providers ORDER BY sort, id").all() as ProviderRow[];
  }
  getProvider(id: number): ProviderRow | undefined {
    return this.db.prepare("SELECT * FROM providers WHERE id=?").get(id) as ProviderRow | undefined;
  }
  getActiveProvider(): ProviderRow | undefined {
    return this.db.prepare("SELECT * FROM providers WHERE is_active=1 ORDER BY sort LIMIT 1").get() as ProviderRow | undefined;
  }
  insertProvider(row: {
    name: string; kind: "ollama" | "openai-compatible"; baseUrl: string;
    apiKeyEnc: string | null; model: string; temperature: number;
    numCtx: number; think: boolean; topK: number; isActive: boolean;
  }): number {
    const now = new Date().toISOString();
    const info = this.db.prepare(
      `INSERT INTO providers(name,kind,base_url,api_key_enc,model,temperature,num_ctx,think,top_k,is_active,sort,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(row.name, row.kind, row.baseUrl, row.apiKeyEnc, row.model, row.temperature,
      row.numCtx, row.think ? 1 : 0, row.topK, row.isActive ? 1 : 0, 0, now, now);
    return Number(info.lastInsertRowid);
  }
  updateProvider(id: number, patch: Partial<{
    name: string; baseUrl: string; apiKeyEnc: string | null; model: string;
    temperature: number; numCtx: number; think: boolean; topK: number; isActive: boolean;
  }>): void {
    const fields: string[] = [];
    const vals: unknown[] = [];
    const map: Record<string, unknown> = { ...patch, apiKeyEnc: patch.apiKeyEnc === undefined ? undefined : patch.apiKeyEnc };
    for (const [k, v] of Object.entries(map)) {
      if (v === undefined) continue;
      fields.push(k + "=?");
      vals.push(v);
    }
    if (!fields.length) return;
    fields.push("updated_at=?");
    vals.push(new Date().toISOString(), id);
    this.db.prepare(`UPDATE providers SET ${fields.join(",")} WHERE id=?`).run(...vals);
  }
  deleteProvider(id: number): void {
    this.db.prepare("DELETE FROM providers WHERE id=?").run(id);
  }
  setActiveProvider(id: number): void {
    this.db.transaction(() => {
      this.db.prepare("UPDATE providers SET is_active=0, updated_at=?").run(new Date().toISOString());
      this.db.prepare("UPDATE providers SET is_active=1, updated_at=? WHERE id=?").run(new Date().toISOString(), id);
    })();
  }
  countProviders(): number {
    return (this.db.prepare("SELECT COUNT(*) c FROM providers").get() as { c: number }).c;
  }

  // ---------- messages ----------
  insertMessage(row: { conversationId: string; role: "user" | "assistant"; content: string; sourcesJson?: string }): number {
    const info = this.db.prepare(
      `INSERT INTO messages(conversation_id,role,content,sources_json,created_at) VALUES(?,?,?,?,?)`
    ).run(row.conversationId, row.role, row.content, row.sourcesJson ?? null, new Date().toISOString());
    return Number(info.lastInsertRowid);
  }
  messagesByConversation(conversationId: string, limit = 50): MessageRow[] {
    return this.db.prepare(
      "SELECT * FROM messages WHERE conversation_id=? ORDER BY id DESC LIMIT ?"
    ).all(conversationId, limit).reverse() as MessageRow[];
  }

  // ---------- settings ----------
  getSetting(key: string, fallback?: string): string | undefined {
    const row = this.db.prepare("SELECT value FROM settings WHERE key=?").get(key) as { value: string } | undefined;
    return row ? row.value : fallback;
  }
  setSetting(key: string, value: string): void {
    this.db.prepare(
      "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
    ).run(key, value);
  }
  allSettings(): Record<string, string> {
    const rows = this.db.prepare("SELECT key,value FROM settings").all() as { key: string; value: string }[];
    const out: Record<string, string> = {};
    for (const r of rows) out[r.key] = r.value;
    return out;
  }
}
