import type { ChatRequest, ChatMessage, DocumentMeta, Provider, ProviderInput, RagEvent, Settings } from "../shared/types";

async function handle<T>(r: Response): Promise<T> {
  if (!r.ok) {
    const j = (await r.json().catch(() => ({}))) as { error?: string };
    throw new Error(j.error || ("HTTP " + r.status));
  }
  return (await r.json()) as T;
}

export const api = {
  health: () => fetch("/api/health").then((r) => handle<Record<string, unknown>>(r)),
  documents: () => fetch("/api/documents").then((r) => handle<{ documents: DocumentMeta[] }>(r)),
  deleteDocument: (id: number) => fetch("/api/documents/" + id, { method: "DELETE" }).then((r) => handle<{ ok: boolean }>(r)),
  reindex: (id: number) => fetch("/api/documents/" + id + "/reindex", { method: "POST" }).then((r) => handle<{ ok: boolean }>(r)),
  reindexAll: () => fetch("/api/documents/reindex-all", { method: "POST" }).then((r) => handle<{ ok: boolean }>(r)),
  upload: (form: FormData) =>
    fetch("/api/documents", { method: "POST", body: form }).then((r) =>
      handle<{ accepted: { id: number; name: string }[]; skipped: { name: string; reason: string }[]; failed: { name: string; reason: string }[] }>(r)
    ),
  providers: () => fetch("/api/providers").then((r) => handle<{ providers: Provider[] }>(r)),
  createProvider: (p: ProviderInput) =>
    fetch("/api/providers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).then((r) => handle<{ ok: boolean; id: number }>(r)),
  updateProvider: (id: number, p: ProviderInput) =>
    fetch("/api/providers/" + id, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) }).then((r) => handle<{ ok: boolean }>(r)),
  deleteProvider: (id: number) => fetch("/api/providers/" + id, { method: "DELETE" }).then((r) => handle<{ ok: boolean }>(r)),
  testProvider: (id: number) => fetch("/api/providers/" + id + "/test", { method: "POST" }).then((r) => handle<{ ok: boolean; latencyMs?: number; error?: string }>(r)),
  settings: () => fetch("/api/settings").then((r) => handle<{ settings: Settings }>(r)),
  saveSettings: (s: Settings) =>
    fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s) }).then((r) => handle<{ ok: boolean }>(r)),
  messages: (conversationId: string) =>
    fetch("/api/conversations/" + encodeURIComponent(conversationId) + "/messages").then((r) => handle<{ messages: ChatMessage[] }>(r)),
};

export interface StreamHandlers {
  onStatus?: (phase: "condensing" | "retrieving" | "generating") => void;
  onSources?: (sources: NonNullable<ChatMessage["sources"]>, lowConfidence: boolean) => void;
  onDelta?: (text: string) => void;
  onDone?: (conversationId: string) => void;
  onError?: (message: string) => void;
}

export async function streamChat(body: ChatRequest, handlers: StreamHandlers, signal?: AbortSignal): Promise<void> {
  const res = await fetch("/api/chat/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    const j = (await res.json().catch(() => ({}))) as { error?: string };
    handlers.onError?.(j.error || ("HTTP " + res.status));
    return;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of raw.split("\n")) {
        if (line.startsWith("event: ")) currentEvent = line.slice(7).trim();
        else if (line.startsWith("data: ")) {
          try {
            const data = JSON.parse(line.slice(6)) as RagEvent;
            dispatchEvent(currentEvent, data, handlers);
          } catch {
            /* 忽略无法解析的帧 */
          }
        }
      }
    }
  }
}

function dispatchEvent(eventName: string, data: RagEvent, handlers: StreamHandlers): void {
  switch (eventName) {
    case "status":
      if (data.type === "status") handlers.onStatus?.(data.phase);
      break;
    case "sources":
      if (data.type === "sources") handlers.onSources?.(data.sources, data.lowConfidence);
      break;
    case "delta":
      if (data.type === "delta") handlers.onDelta?.(data.text);
      break;
    case "done":
      if (data.type === "done") handlers.onDone?.(data.conversationId);
      break;
    case "error":
      handlers.onError?.((data as { message?: string }).message ?? "未知错误");
      break;
  }
}
