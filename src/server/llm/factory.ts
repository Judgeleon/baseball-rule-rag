import type { Repo, ProviderRow } from "../db/repo";
import type { IChatProvider, ProviderConfig } from "./types";
import { OllamaProvider } from "./ollamaProvider";
import { OpenAICompatProvider } from "./openaiCompatProvider";
import { decryptSecret } from "./crypto";
import type { AppConfig } from "../config";

export function rowToProvider(row: ProviderRow, secret: string): ProviderConfig {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    baseUrl: row.base_url,
    apiKey: row.api_key_enc ? decryptSecret(row.api_key_enc, secret) : undefined,
    model: row.model,
    temperature: row.temperature,
    numCtx: row.num_ctx,
    think: row.think === 1,
    topK: row.top_k,
  };
}

export function createProvider(row: ProviderRow, secret: string): IChatProvider {
  const cfg = rowToProvider(row, secret);
  return row.kind === "ollama"
    ? new OllamaProvider(cfg)
    : new OpenAICompatProvider(cfg);
}

export function resolveActiveProvider(repo: Repo, secret: string): IChatProvider | null {
  const row = repo.getActiveProvider();
  if (!row) return null;
  return createProvider(row, secret);
}

export function resolveProvider(repo: Repo, secret: string, id?: number): IChatProvider | null {
  const row = id ? repo.getProvider(id) : repo.getActiveProvider();
  if (!row) return null;
  return createProvider(row, secret);
}
