import type { Repo } from "./db/repo";
import type { Settings } from "../shared/types";

export function readSettings(repo: Repo): Settings {
  const s = repo.allSettings();
  return {
    embeddingBaseUrl: s.embedding_base_url ?? "http://192.168.5.19:11434",
    embeddingModel: s.embedding_model ?? "qwen3-embedding:4b",
    embeddingDimensions: Number(s.embedding_dimensions ?? 2560),
    embeddingBatch: Number(s.embedding_batch ?? 32),
    retrieveTopK: Number(s.retrieve_top_k ?? 6),
    scoreThreshold: Number(s.score_threshold ?? 0.35),
    includeCases: s.include_cases !== "0",
    maxHistoryTurns: Number(s.max_history_turns ?? 6),
    systemPrompt: s.system_prompt ?? "",
    welcomeMessage: s.welcome_message ?? "",
  };
}
