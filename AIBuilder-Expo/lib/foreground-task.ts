import { persistentLogger } from "./persistent-logger";
/**
 * Foreground task tracker — logical long-running work sessions.
 * Does not start Android Foreground Service by itself (that requires native
 * config already partially present). Tracks tasks for UI + watchdog + journal.
 *
 * DSHA keeps a permanent FS; we only mark *active long work* and expose snapshot
 * for notifications / future native bridge.
 */
export type ForegroundTaskKind =
  | "build"
  | "inference"
  | "rootfs"
  | "backup"
  | "restore"
  | "download"
  | "agent"
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
  const id = `fg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  tasks.set(id, { id, kind, title, startedAt: Date.now(), meta, progress: 0 });
  emit();
  void notifyFg(`[${kind}] ${title}`, "AI Builder — long task running");
  return id;
}

export function updateForegroundTask(id: string, patch: { title?: string; progress?: number }): void {
  const t = tasks.get(id);
  if (!t) return;
  tasks.set(id, {
    ...t,
    title: patch.title ?? t.title,
    progress:
      patch.progress !== undefined
        ? Math.min(1, Math.max(0, Number.isFinite(patch.progress) ? patch.progress : 0))
        : t.progress,
  });
  emit();
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
