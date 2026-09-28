/** Optional agent intelligence features. All features are local, dependency-free,
 * and fail open so they cannot affect the Android build pipeline. */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistAsyncStorageItem } from "./persistence";

export interface AgentIntelligenceSettings {
  memory: boolean;
  hashline: boolean;
  subagents: boolean;
  reviewer: boolean;
  advisor: boolean;
  ast: boolean;
  lsp: boolean;
  github: boolean;
  streamRules: boolean;
  autoPreflight: boolean;
  autoPostReview: boolean;
  advisorInterval: number;
}

/**
 * Defaults for a strong autonomous agent without burning free-model quotas:
 * OFF: subagents, advisor, preflight, post-review, reviewer (extra LLM rounds);
 *      hashline off so the agent can write new project files via TERMUX_RUN (create-app).
 * ON: memory, streamRules; AST/LSP/GitHub tools available on demand.
 */
export const DEFAULT_AGENT_INTELLIGENCE: AgentIntelligenceSettings = {
  memory: true,
  hashline: false,
  subagents: false,
  reviewer: false,
  advisor: false,
  ast: true,
  lsp: true,
  github: true,
  streamRules: true,
  autoPreflight: false,
  autoPostReview: false,
  advisorInterval: 4,
};

/** v2 resets stored prefs so new defaults apply once (old v1 ignored). */
const KEY = "aibuilder.agentIntelligence.v2";

export async function loadAgentIntelligenceSettings(): Promise<AgentIntelligenceSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_AGENT_INTELLIGENCE;
    const parsed = JSON.parse(raw) as Partial<AgentIntelligenceSettings>;
    const merged = { ...DEFAULT_AGENT_INTELLIGENCE, ...parsed };
    merged.advisorInterval = Math.min(12, Math.max(1, Number(merged.advisorInterval) || 4));
    return merged;
  } catch { return DEFAULT_AGENT_INTELLIGENCE; }
}

export async function saveAgentIntelligenceSettings(value: AgentIntelligenceSettings): Promise<void> {
  persistAsyncStorageItem(KEY, JSON.stringify(value));
}

export function buildIntelligencePrompt(s: AgentIntelligenceSettings): string {
  const enabled = Object.entries(s)
    .filter(([, v]) => typeof v === "boolean" && v)
    .map(([k]) => k)
    .join(", ");
  return (
    `[AGENT_INTELLIGENCE] Enabled: ${enabled || "none"}. ` +
    "You are the sole executor: finish the user task end-to-end (tools → work → verify). " +
    "Never claim success without a real exit code and artifact from [TERMUX_RESULT] / tool results. " +
    "Prefer AIB_TOOL when available: build.run, fs.read/hashline/create/delete/replace/replaceRange, " +
    "ast.search/preview/edit, lsp.*, github.*, skills.*, memory.*. " +
    (s.hashline
      ? "Hashline ON: TERMUX_RUN is read-only for source edits; mutate files via hashline/AST tools; builds via build.run. "
      : "Hashline OFF: careful shell edits allowed under path whitelist. ") +
    "Install missing Termux packages for device arch yourself; on dead download URLs retry only the pinned allowlisted source or verified APK build tool-pack (pinned SHA-256), never an unverified mirror. " +
    "Smallest safe change; re-verify after every edit. No invented BUILD SUCCESSFUL / fake paths."
  );
}
