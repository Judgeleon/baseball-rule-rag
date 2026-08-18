import { Router } from "express";
import multer from "multer";
import { createHash } from "node:crypto";
import { rm, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { Dependencies } from "../app";
import type { DocType } from "../../shared/types";

const ALLOWED: Record<string, string[]> = {
  ".pdf": ["application/pdf"],
  ".txt": ["text/plain"],
  ".md": ["text/markdown", "text/plain"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
};
const MAX_SIZE = 50 * 1024 * 1024;

export function documentsRouter(deps: Dependencies): Router {
  const r = Router();
  const upload = multer({
    storage: multer.diskStorage({
      destination: deps.config.uploadsDir,
      filename: (_req, file, cb) => {
        const ext = file.originalname.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "bin";
        cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`);
      },
    }),
    limits: { fileSize: MAX_SIZE },
  });

  r.get("/", (_req, res) => {
    const docs = deps.repo.listDocuments().map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      status: d.status,
      sizeBytes: d.size_bytes,
      mime: d.mime,
      sha256: d.sha256 ?? undefined,
      chunkCount: d.chunk_count,
      error: d.error ?? undefined,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
    res.json({ documents: docs });
  });

  r.post("/", upload.array("files", 10), async (req, res) => {
    const files = (req.files as Express.Multer.File[]) ?? [];
    if (files.length === 0) {
      res.status(400).json({ error: "未收到文件（字段名应为 files）" });
      return;
    }
    const typeOverride = (req.body.type as DocType | undefined) ?? undefined;
    const accepted: { id: number; name: string }[] = [];
    const skipped: { name: string; reason: string }[] = [];
    const failed: { name: string; reason: string }[] = [];

    for (const f of files) {
      // multer/busboy 将 UTF-8 文件名按 latin1 解码，这里做回转换以保留中文名
      const originalName = Buffer.from(f.originalname, "latin1").toString("utf8");
      const ext = "." + (originalName.match(/\.([a-zA-Z0-9]+)$/)?.[1]?.toLowerCase() ?? "");
      if (!ALLOWED[ext]) {
        failed.push({ name: originalName, reason: "不支持的文件类型（仅支持 pdf/txt/md/docx）" });
        continue;
      }
      let sha: string;
      try {
        const buf = await stat(f.path);
        if (buf.size > MAX_SIZE) {
          failed.push({ name: originalName, reason: "文件超过 50MB 限制" });
          continue;
        }
        sha = createHash("sha256").update(await readFile(f.path)).digest("hex");
      } catch (e) {
        failed.push({ name: originalName, reason: e instanceof Error ? e.message : String(e) });
        continue;
      }
      const dup = deps.repo.findBySha256(sha);
      if (dup) {
        skipped.push({ name: originalName, reason: "与已存在文档内容相同（已跳过）" });
        continue;
      }
      const type: DocType = typeOverride ?? (ext === ".pdf" && /规则/.test(originalName) ? "rules" : ext === ".pdf" ? "other" : "case");
      const docId = deps.repo.insertDocument({
        name: originalName,
        storedPath: f.filename,
        mime: f.mimetype || ALLOWED[ext][0],
        sizeBytes: f.size,
        type,
        sha256: sha,
      });
      accepted.push({ id: docId, name: originalName });
      // 后台索引（串行队列）
      deps.queue.enqueue(async () => {
        const indexer = deps.createIndexer();
        try {
          await indexer.indexFile(docId, join(deps.config.uploadsDir, f.filename), f.mimetype || ALLOWED[ext][0]);
        } catch (e) {
          deps.repo.updateDoc(docId, {
            status: "failed",
            error: e instanceof Error ? e.message : String(e),
          });
        }
      });
    }
    res.json({ accepted, skipped, failed });
  });

  r.delete("/:id", async (req, res) => {
    const id = Number(req.params.id);
    const doc = deps.repo.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    await deps.queue.enqueue(async () => {
      const indexer = deps.createIndexer();
      await indexer.deleteDocument(id);
    });
    try {
      await rm(join(deps.config.uploadsDir, doc.stored_path), { force: true });
    } catch {
      /* 忽略文件删除失败 */
    }
    res.json({ ok: true });
  });

  r.post("/:id/reindex", (req, res) => {
    const id = Number(req.params.id);
    const doc = deps.repo.getDocument(id);
    if (!doc) {
      res.status(404).json({ error: "文档不存在" });
      return;
    }
    deps.queue.enqueue(async () => {
      const indexer = deps.createIndexer();
      try {
        await indexer.indexFile(id, join(deps.config.uploadsDir, doc.stored_path), doc.mime);
      } catch (e) {
        deps.repo.updateDoc(id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    });
    res.json({ ok: true });
  });

  r.post("/reindex-all", (req, res) => {
    deps.queue.enqueue(async () => {
      const indexer = deps.createIndexer();
      for (const doc of deps.repo.listDocuments()) {
        try {
          await indexer.indexFile(doc.id, join(deps.config.uploadsDir, doc.stored_path), doc.mime);
        } catch (e) {
          deps.repo.updateDoc(doc.id, { status: "failed", error: e instanceof Error ? e.message : String(e) });
        }
      }
    });
    res.json({ ok: true });
  });

  r.get("/:id/chunks", (req, res) => {
    const id = Number(req.params.id);
    const chunks = deps.repo.chunksByDoc(id).map((c) => ({
      id: c.id,
      seq: c.seq,
      ruleNo: c.rule_no,
      chapter: c.chapter,
      page: c.page,
      content: c.content.slice(0, 500),
    }));
    res.json({ chunks });
  });

  return r;
}
