import type { ProviderKind } from "../../shared/types";

export interface ChatTurn {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderConfig {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature: number;
  numCtx: number;
  think: boolean;
  topK: number;
}

export interface IChatProvider {
  readonly id: number;
  readonly name: string;
  readonly kind: ProviderKind;
  readonly model: string;
  stream(turns: ChatTurn[], opts?: { signal?: AbortSignal }): AsyncIterable<string>;
  invoke(turns: ChatTurn[], opts?: { signal?: AbortSignal }): Promise<string>;
  testConnection(): Promise<{ ok: boolean; latencyMs?: number; error?: string }>;
}

export function normalizeBaseUrl(url: string): string {
  const u = url.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(u)) return "http://" + u;
  return u;
}
