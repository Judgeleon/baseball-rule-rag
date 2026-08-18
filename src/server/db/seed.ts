import type { Db } from "./connection";
import type { AppConfig } from "../config";

export function seedDefaults(db: Db, cfg: AppConfig): void {
  // 默认设置
  const defaults: Record<string, string> = {
    embedding_base_url: cfg.ollamaBaseUrl,
    embedding_model: cfg.embeddingModel,
    embedding_dimensions: String(cfg.embeddingDimensions),
    embedding_batch: "32",
    retrieve_top_k: "6",
    score_threshold: "0.35",
    include_cases: "1",
    max_history_turns: "6",
    system_prompt: "",
    welcome_message: "你好，我是棒球规则助手。你可以问我《棒球规则 2022 版》中的任何问题，例如“二出局满垒时击出内野高飞球如何判罚？”。",
  };
  const upsertSetting = db.prepare(
    "INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  );
  for (const [k, v] of Object.entries(defaults)) upsertSetting.run(k, v);

  // 默认 Provider：本地 Ollama + DeepSeek 模板
  const count = db.prepare("SELECT COUNT(*) AS c FROM providers").get() as { c: number };
  if (count.c === 0) {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO providers(name,kind,base_url,model,temperature,num_ctx,think,top_k,is_active,sort,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      "本地 Ollama (192.168.5.19)", "ollama", cfg.ollamaBaseUrl, cfg.defaultChatModel,
      0.2, 8192, 1, 6, 1, 1, now, now
    );
    db.prepare(
      `INSERT INTO providers(name,kind,base_url,model,temperature,num_ctx,think,top_k,is_active,sort,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(
      "DeepSeek（需填写 API Key）", "openai-compatible", "https://api.deepseek.com",
      "deepseek-chat", 0.2, 8192, 0, 6, 0, 2, now, now
    );
  }
}
