import { checkTermuxReadiness } from "./termux-bridge";

export type ReadyLevel = "ok" | "warn" | "bad" | "off";

export interface ReadyItem {
  id: string;
  level: ReadyLevel;
  label: string;
}

export interface ReadinessSnapshot {
  items: ReadyItem[];
  /** short one-line summary */
  summary: string;
}

export type ReadyMode = "local" | "online" | "deepseek" | "custom" | "opencode";

export async function computeReadiness(opts: {
  /** OpenRouter / online key present */
  hasApiKey: boolean;
  /** Custom provider (slot 1 or 2) key present */
  hasCustomApiKey?: boolean;
  /** OpenCode key present */
  hasOpenCodeApiKey?: boolean;
  mode: ReadyMode;
  localLoaded: boolean;
  localDownloaded: boolean;
  termuxEnabled: boolean;
  labels: {
    api: string;
    modelOnline: string;
    modelOffline: string;
    modelOfflineNeed: string;
    modelCustom?: string;
    modelOpenCode?: string;
    termuxOn: string;
    termuxOff: string;
    termuxNotReady: string;
  };
}): Promise<ReadinessSnapshot> {
  const items: ReadyItem[] = [];
  const mode = opts.mode === "deepseek" ? "custom" : opts.mode;

  const effectiveApi =
    mode === "custom"
      ? !!opts.hasCustomApiKey
      : mode === "opencode"
        ? !!opts.hasOpenCodeApiKey
        : mode === "online"
          ? opts.hasApiKey
          : opts.hasApiKey || !!opts.hasCustomApiKey;

  items.push({
    id: "api",
    level: effectiveApi
      ? "ok"
      : mode === "local"
        ? "warn"
        : "bad",
    label: opts.labels.api + (effectiveApi ? " ✓" : " —"),
  });

  if (mode === "online") {
    items.push({
      id: "model",
      level: opts.hasApiKey ? "ok" : "bad",
      label: opts.labels.modelOnline,
    });
  } else if (mode === "custom") {
    items.push({
      id: "model",
      level: opts.hasCustomApiKey ? "ok" : "bad",
      label: opts.labels.modelCustom || "Custom",
    });
  } else if (mode === "opencode") {
    items.push({
      id: "model",
      level: opts.hasOpenCodeApiKey ? "ok" : "bad",
      label: opts.labels.modelOpenCode || "OpenCode",
    });
  } else {
    items.push({
      id: "model",
      level: opts.localLoaded ? "ok" : opts.localDownloaded ? "warn" : "bad",
      label: opts.localLoaded
        ? opts.labels.modelOffline
        : opts.labels.modelOfflineNeed,
    });
  }

  if (opts.termuxEnabled) {
    const r = await checkTermuxReadiness();
    items.push({
      id: "termux",
      level: r.ready ? "ok" : "bad",
      label: r.ready ? opts.labels.termuxOn : opts.labels.termuxNotReady,
    });
  } else {
    items.push({
      id: "termux",
      level: "off",
      label: opts.labels.termuxOff,
    });
  }

  const summary = items.map((i) => i.label).join(" · ");
  return { items, summary };
}
