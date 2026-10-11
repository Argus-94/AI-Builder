import { persistentLogger } from "./persistent-logger";
/**
 * Foreground task tracker — logical long-running work sessions.
 *
 * NATIVE FOREGROUND SERVICE: intentionally NOT started here.
 * - Sticky notifications via `notifyLongTask` (expo-notifications) keep the user aware.
 * - Full Android ForegroundService would require additional native config; not required for DoD.
 * - Tracks tasks for Runtime UI, watchdog, journal, and recovery coordination.
 *
 * DSHA keeps a permanent FS; we only mark *active long work* and expose a snapshot
 * for notifications / optional future native bridge.
 */
export type ForegroundTaskKind =
  | "build"
  | "inference"
  | "rootfs"
  | "backup"
  | "restore"
  | "download"
  | "agent"
  | "first-run"
  | "bootstrap"
  | "other";

export type ForegroundTask = Readonly<{
  id: string;
  kind: ForegroundTaskKind;
  title: string;
  progress?: number; // 0..1
  startedAt: number;
  meta?: Readonly<Record<string, string>>;
}>;

type Listener = (tasks: readonly ForegroundTask[]) => void;

const tasks = new Map<string, ForegroundTask>();
const listeners = new Set<Listener>();

function emit(): void {
  const snap = [...tasks.values()];
  for (const l of listeners) {
    try {
      l(snap);
    } catch {
      /* ignore */
    }
  }
}

async function notifyFg(title: string, body: string): Promise<void> {
  try {
    const n = await import("./app-notifications");
    // sticky task notification while long work runs
    if (typeof (n as { notifyLongTask?: (a: string, b: string) => Promise<void> }).notifyLongTask === "function") {
      await (n as { notifyLongTask: (a: string, b: string) => Promise<void> }).notifyLongTask(title, body);
    } else if (typeof n.notifyModelLoaded === "function") {
      /* fallback: present via generic if exported */
    }
  } catch {
    /* notifications optional */
  }
}

export function startForegroundTask(
  kind: ForegroundTaskKind,
  title: string,
  meta?: Record<string, string>,
): string {
  // Bound concurrent tasks — drop oldest if map grows (leak/guard)
  if (tasks.size >= 8) {
    const oldest = [...tasks.values()].sort((a, b) => a.startedAt - b.startedAt)[0];
    if (oldest) {
      tasks.delete(oldest.id);
      persistentLogger.add("warn", "Foreground", `evicted stale task ${oldest.id} (${oldest.kind})`);
    }
  }
  const id = `fg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const safeTitle = String(title || kind).replace(/\s+/g, " ").trim().slice(0, 120) || kind;
  tasks.set(id, { id, kind, title: safeTitle, startedAt: Date.now(), meta, progress: 0 });
  emit();
  void notifyFg(`[${kind}] ${safeTitle}`, "AI Builder — long task running");
  return id;
}

export function updateForegroundTask(id: string, patch: { title?: string; progress?: number }): void {
  const t = tasks.get(id);
  if (!t) return;
  const next = {
    ...t,
    title: patch.title ?? t.title,
    progress:
      patch.progress !== undefined
        ? Math.min(1, Math.max(0, Number.isFinite(patch.progress) ? patch.progress : 0))
        : t.progress,
  };
  tasks.set(id, next);
  emit();
  // Refresh sticky notification so progress is visible when app is backgrounded.
  const pct = next.progress !== undefined ? Math.round(next.progress * 100) : undefined;
  const body = pct !== undefined ? `${pct}% — AI Builder long task` : "AI Builder — long task running";
  void notifyFg(`[${next.kind}] ${next.title}`, body);
}

export function endForegroundTask(id: string): void {
  const t = tasks.get(id);
  if (t) persistentLogger.add("info", "Foreground", `end [${t.kind}] ${t.title}`);
  tasks.delete(id);
  emit();
  if (tasks.size === 0) {
    void (async () => {
      try {
        const n = await import("./app-notifications");
        if (typeof (n as { clearTaskSticky?: () => Promise<void> }).clearTaskSticky === "function") {
          await (n as { clearTaskSticky: () => Promise<void> }).clearTaskSticky();
        }
      } catch { /* optional */ }
    })();
  }
}

export function listForegroundTasks(): ForegroundTask[] {
  return [...tasks.values()];
}

export function subscribeForegroundTasks(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Run async work with automatic start/end tracking. */
export async function withForegroundTask<T>(
  kind: ForegroundTaskKind,
  title: string,
  body: (update: (progress: number, title?: string) => void) => Promise<T>,
): Promise<T> {
  const id = startForegroundTask(kind, title);
  try {
    return await body((progress, newTitle) => {
      updateForegroundTask(id, { progress, title: newTitle });
    });
  } finally {
    endForegroundTask(id);
  }
}
