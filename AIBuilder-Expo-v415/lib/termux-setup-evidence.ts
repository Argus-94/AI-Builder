export type TermuxSetupIssue = "android-run-command-missing" | "allow-external-apps-disabled";

export type TermuxEvidenceLogEntry = Readonly<{
  timestamp: number;
  tag: string;
  message: string;
  sessionId?: string;
}>;

type EvidenceTrace = Readonly<{
  correlationId?: string;
  commandId?: string;
  action?: string;
  step?: string;
  status?: string;
  backend?: string;
  target?: string;
  androidRunCommand?: "granted" | "missing" | "unknown";
  termuxExternalApps?: "allowed" | "blocked" | "unknown" | "not-observed";
}>;

function parseTrace(entry: TermuxEvidenceLogEntry): EvidenceTrace | null {
  if (entry.tag !== "Trace") return null;
  try {
    const value: unknown = JSON.parse(entry.message);
    if (!value || typeof value !== "object") return null;
    return value as EvidenceTrace;
  } catch {
    return null;
  }
}

/**
 * Project only current-session, structured evidence into actionable setup issues.
 * Plain warning text, unknown permission reads and not-observed Termux settings
 * never become a claim that either permission/setting is missing.
 */
export function getCurrentTermuxSetupIssues(entries: readonly TermuxEvidenceLogEntry[]): TermuxSetupIssue[] {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => Number.isFinite(entry.timestamp))
    .sort((a, b) => b.entry.timestamp - a.entry.timestamp || a.index - b.index);
  const currentSessionId = ordered.find(({ entry }) => typeof entry.sessionId === "string" && entry.sessionId.length > 0)?.entry.sessionId;
  const sessionEntries = currentSessionId
    ? ordered.filter(({ entry }) => entry.sessionId === currentSessionId)
    : ordered.filter(({ entry }) => !entry.sessionId);

  const traces = sessionEntries.flatMap(({ entry, index }) => {
    const trace = parseTrace(entry);
    return trace ? [{ trace, timestamp: entry.timestamp, index }] : [];
  });
  const isTermux = (trace: EvidenceTrace) => trace.backend === "termux" && trace.target === "termux";
  const compareNewest = <T extends { timestamp: number; index: number }>(a: T, b: T) =>
    b.timestamp - a.timestamp || a.index - b.index;
  const latestByGeneration = <T extends { trace: EvidenceTrace; timestamp: number; index: number }>(items: T[]) => {
    const generationLatest = new Map<string, T>();
    for (const item of items) {
      const key = item.trace.commandId
        ? `command:${item.trace.commandId}`
        : item.trace.correlationId
          ? `correlation:${item.trace.correlationId}`
          : `event:${item.index}`;
      const previous = generationLatest.get(key);
      if (!previous || compareNewest(item, previous) < 0) generationLatest.set(key, item);
    }
    return [...generationLatest.values()].sort(compareNewest)[0];
  };

  const permissionObservation = latestByGeneration(traces.filter(({ trace }) =>
    isTermux(trace) &&
    (trace.step === "android.run-command-permission-check" ||
      (trace.action === "termux.readiness" && trace.step === "readiness.android-permissions")) &&
    (trace.androidRunCommand === "missing" || trace.androidRunCommand === "granted" || trace.androidRunCommand === "unknown"),
  ));

  const externalAppsObservation = latestByGeneration(traces.filter(({ trace }) =>
    isTermux(trace) && trace.step === "bridge.command-result" &&
    (trace.termuxExternalApps === "blocked" || trace.termuxExternalApps === "allowed" ||
      trace.termuxExternalApps === "unknown" || trace.termuxExternalApps === "not-observed"),
  ));

  const issues: TermuxSetupIssue[] = [];
  if (permissionObservation?.trace.androidRunCommand === "missing") {
    issues.push("android-run-command-missing");
  }
  if (externalAppsObservation?.trace.termuxExternalApps === "blocked") {
    issues.push("allow-external-apps-disabled");
  }
  return issues;
}
