// 前后端共享的类型定义（DTO）
export type DocType = "rules" | "case" | "other";
export type DocStatus = "pending" | "parsing" | "indexing" | "indexed" | "failed";

export interface DocumentMeta {
  id: number;
  name: string;
  type: DocType;
  status: DocStatus;
  sizeBytes: number;
  mime: string;
  sha256?: string;
  chunkCount: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SourceRef {
  chunkId: number;
  docId: number;
  docName: string;
  type: DocType;
  ruleNo?: string;
  chapter?: string;
  page?: number;
  score: number;
  excerpt: string;
}

export type ProviderKind = "ollama" | "openai-compatible";

export interface Provider {
  id: number;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  temperature: number;
  numCtx: number;
  think: boolean;
  topK: number;
  isActive: boolean;
  hasApiKey: boolean;
  apiKeyMasked?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderInput {
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
  temperature: number;
  numCtx: number;
  think: boolean;
  topK: number;
  isActive: boolean;
}

export interface Settings {
  embeddingBaseUrl: string;
  embeddingModel: string;
  embeddingDimensions: number;
  embeddingBatch: number;
  retrieveTopK: number;
  scoreThreshold: number;
  includeCases: boolean;
  maxHistoryTurns: number;
  systemPrompt: string;
  welcomeMessage: string;
}

export interface ChatMessage {
  id: number;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  sources?: SourceRef[];
  createdAt: string;
}

export interface HealthStatus {
  ok: boolean;
  ollama: { reachable: boolean; version?: string; models?: string[]; error?: string };
  db: { documents: number; chunks: number; indexedDocs: number };
  embeddingModel: string;
  embeddingDimensions: number;
  activeProvider: { name: string; model: string; kind: ProviderKind } | null;
}

// SSE 事件负载
export type RagEvent =
  | { type: "status"; phase: "condensing" | "retrieving" | "generating" }
  | { type: "sources"; sources: SourceRef[]; lowConfidence: boolean }
  | { type: "delta"; text: string }
  | { type: "done"; conversationId: string; messageId: number | null };

export interface ChatRequest {
  question: string;
  conversationId?: string;
  providerId?: number;
  topK?: number;
  threshold?: number;
}
