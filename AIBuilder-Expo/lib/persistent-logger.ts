import { errorMessage, errorName } from "./error-utils";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistAsyncStorageItem } from "./persistence";
import { redactSecrets } from "./log-redaction";

/**
 * Единый лог приложения: UI, Termux, сети, краши.
 * Переживает перезапуск (AsyncStorage). Пишет всё без «тихих» пропусков.
 */

export type LogLevel = "info" | "warn" | "error" | "debug";

export interface LogEntry {
  id: string;
  level: LogLevel;
  tag: string;
  message: string;
  timestamp: number;
  sessionId?: string;
  source?: "app" | "termux" | "native" | "console" | "network" | "agent";
}

const STORAGE_KEY = "aibuilder.log.persistent.v2";
/** Ограничиваем и количество записей, и общий объём, чтобы AsyncStorage не переполнялся. */
const MAX_ENTRIES = 8000;
const MAX_PERSISTED_CHARS = 5_000_000;
/** Одна запись может быть большой (например, Gradle/Termux), но не бесконечной. */
const MAX_MESSAGE_CHARS = 250_000;

type Listener = (entries: LogEntry[]) => void;


function sanitizePersistedEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== "object") return null;
  const e = value as Partial<LogEntry>;
  if (typeof e.id !== "string" || typeof e.message !== "string" || typeof e.timestamp !== "number") return null;
  return {
    id: e.id,
    level: e.level === "warn" || e.level === "error" || e.level === "debug" ? e.level : "info",
    tag: redactSecrets(String(e.tag || "App")),
    message: redactSecrets(e.message),
    timestamp: e.timestamp,
    sessionId: typeof e.sessionId === "string" ? redactSecrets(e.sessionId) : undefined,
    source: e.source,
  };
}

/** Public helper for export / share paths (same rules as storage). */
export function redactLogText(value: string): string {
  return redactSecrets(value);
}

function trimToStorageBudget(entries: LogEntry[]): LogEntry[] {
  const out: LogEntry[] = [];
  let chars = 2;
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const cost = entry.message.length + entry.tag.length + (entry.sessionId?.length || 0) + 160;
    if (out.length > 0 && chars + cost > MAX_PERSISTED_CHARS) break;
    out.push(entry);
    chars += cost;
    if (out.length >= MAX_ENTRIES) break;
  }
  return out.reverse();
}

class PersistentLogger {
  private entries: LogEntry[] = [];
  private listeners = new Set<Listener>();
  private hydrated = false;
  private hydratePromise: Promise<void> | null = null;
  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private persistQueued = false;
  private sessionId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  private consoleInstalled = false;
  private globalHandlersInstalled = false;
  private fetchInstalled = false;
  private clearedBeforeHydrate = false;

  hydrate(): Promise<void> {
    if (this.hydratePromise) return this.hydratePromise;
    this.hydratePromise = (async () => {
      try {
        // v2, затем fallback v1
        let raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (!raw) raw = await AsyncStorage.getItem("aibuilder.log.persistent.v1");
        if (raw && !this.clearedBeforeHydrate) {
          const parsed = JSON.parse(raw) as unknown[];
          if (Array.isArray(parsed)) {
            // Re-redact legacy v1/v2 records on hydration: older builds may
            // have persisted a token before the stronger redaction rules.
            const incoming = trimToStorageBudget(
              parsed.map(sanitizePersistedEntry).filter((e): e is LogEntry => !!e)
            );
            const existing = this.entries;
            const seen = new Set(existing.map((e) => e.id));
            this.entries = trimToStorageBudget([...incoming, ...existing.filter((e) => !seen.has(e.id))]);
            // Persist only the sanitized representation; remove the legacy
            // copy so a future downgrade/restart cannot resurrect raw v1 data.
            persistAsyncStorageItem(STORAGE_KEY, JSON.stringify(this.entries));
            void AsyncStorage.removeItem("aibuilder.log.persistent.v1").catch((error: unknown) => console.warn(`[AIB][storage] AsyncStorage remove failed for aibuilder.log.persistent.v1: ${error instanceof Error ? error.message : String(error)}`));
          }
        }
      } catch {
        // ignore
      } finally {
        this.hydrated = true;
        this.notify();
      }
    })();
    return this.hydratePromise;
  }

  getSessionId(): string {
    return this.sessionId;
  }

  startSession(reason = "startup") {
    this.sessionId = `app-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.add("info", "AppSession", `SESSION_START id=${this.sessionId} reason=${reason}`, "app");
  }

  isHydrated(): boolean {
    return this.hydrated;
  }

  getAll(): LogEntry[] {
    return this.entries;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    for (const listener of this.listeners) listener(this.entries);
  }

  private schedulePersist() {
    this.persistQueued = true;
    if (this.persistTimer) return;
    // debounce 400ms — при лавине записей (Termux stdout) не убиваем AsyncStorage
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      if (!this.persistQueued) return;
      this.persistQueued = false;
      persistAsyncStorageItem(STORAGE_KEY, JSON.stringify(trimToStorageBudget(this.entries)));
    }, 400);
  }

  add(level: LogLevel, tag: string, message: string, source: LogEntry["source"] = "app") {
    const full = redactSecrets(message ?? "");
    // Termux (and agent shell) must not lose output: split into sequential
    // entries instead of truncating a single message.
    const chunks: string[] =
      full.length <= MAX_MESSAGE_CHARS
        ? [full]
        : (() => {
            const out: string[] = [];
            let offset = 0;
            let part = 1;
            const total = Math.ceil(full.length / MAX_MESSAGE_CHARS);
            while (offset < full.length) {
              const piece = full.slice(offset, offset + MAX_MESSAGE_CHARS);
              out.push(
                total > 1
                  ? `[part ${part}/${total}]\n${piece}`
                  : piece
              );
              offset += MAX_MESSAGE_CHARS;
              part += 1;
            }
            return out;
          })();

    let next = this.entries;
    const ts = Date.now();
    for (let i = 0; i < chunks.length; i++) {
      const entry: LogEntry = {
        id: `${ts}-${Math.random().toString(36).slice(2, 10)}-${i}`,
        level,
        tag: tag || "App",
        message: chunks[i],
        timestamp: ts + i,
        sessionId: this.sessionId,
        source,
      };
      next = trimToStorageBudget([...next, entry]);
    }
    this.entries = next;
    this.notify();
    this.schedulePersist();
  }

  /** Принудительно сбросить на диск (перед тяжёлой операцией / крашем). */
  flush() {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistQueued = false;
    persistAsyncStorageItem(STORAGE_KEY, JSON.stringify(trimToStorageBudget(this.entries)));
  }

  installRuntimeCapture() {
    if (this.globalHandlersInstalled) return;
    this.globalHandlersInstalled = true;
    this.startSession("runtime-init");

    // JS console: capture what normally disappears from the in-app log.
    if (!this.consoleInstalled && typeof console !== "undefined") {
      this.consoleInstalled = true;
      const c = console as any;
      for (const level of ["log", "info", "warn", "error", "debug"] as const) {
        const original = c[level];
        if (typeof original !== "function") continue;
        c[level] = (...args: any[]) => {
          try {
            const text = args.map((x) => {
              if (x instanceof Error) return `${x.name}: ${x.message}\n${x.stack || ""}`;
              if (typeof x === "string") return x;
              try { return JSON.stringify(x); } catch { return String(x); }
            }).join(" ");
            this.add(level === "error" ? "error" : level === "warn" ? "warn" : level === "debug" ? "debug" : "info", "Console", text, "console");
          } catch {}
          try { original.apply(console, args); } catch {}
        };
      }
    }

    // Capture every JS fetch without recording request bodies/authorization.
    try {
      const g: any = globalThis as any;
      if (!this.fetchInstalled && typeof g.fetch === "function") {
        this.fetchInstalled = true;
        const originalFetch = g.fetch.bind(g);
        g.fetch = async (input: any, init?: any) => {
          const method = String(init?.method || input?.method || "GET").toUpperCase();
          const rawUrl = typeof input === "string" ? input : String(input?.url || "unknown");
          const safeUrl = rawUrl.replace(/([?&](?:key|api[_-]?key|token|access_token|authorization|secret)=)[^&]+/gi, "$1[REDACTED]");
          const started = Date.now();
          this.add("debug", "Network", `→ ${method} ${safeUrl}`, "network");
          try {
            const response = await originalFetch(input, init);
            this.add(response.ok ? "debug" : "warn", "Network", `← ${method} ${safeUrl} HTTP ${response.status} (${Date.now() - started}ms)`, "network");
            return response;
          } catch (e: unknown) {
            this.add("error", "Network", `× ${method} ${safeUrl} ${Date.now() - started}ms: ${errorMessage(e)}`, "network");
            throw e;
          }
        };
      }
    } catch {}

    // React Native global fatal/unhandled hooks when available.
    try {
      const g: any = globalThis as any;
      const ErrorUtils = g.ErrorUtils;
      if (ErrorUtils?.setGlobalHandler && !ErrorUtils.__aibuilderWrapped) {
        const previous = ErrorUtils.getGlobalHandler?.();
        ErrorUtils.setGlobalHandler((error: any, isFatal: boolean) => {
          this.add("error", "GlobalError", `fatal=${!!isFatal} ${errorName(error) || "Error"}: ${errorMessage(error)}\n${(error instanceof Error ? error.stack || "" : "")}`, "app");
          this.flush();
          try { previous?.(error, isFatal); } catch {}
        });
        ErrorUtils.__aibuilderWrapped = true;
      }
    } catch {}

    try {
      const g: any = globalThis as any;
      const previous = g.onunhandledrejection;
      g.onunhandledrejection = (event: any) => {
        const r = event?.reason;
        this.add("error", "UnhandledRejection", `${errorName(r) || "Error"}: ${errorMessage(r)}\n${(r instanceof Error ? r.stack || "" : "")}`, "app");
        try { previous?.(event); } catch {}
      };
    } catch {}
  }

  markAppEvent(event: string, details?: unknown) {
    let suffix = "";
    if (details !== undefined) {
      try { suffix = ` ${JSON.stringify(details)}`; } catch { suffix = ` ${String(details)}`; }
    }
    this.add("info", "AppEvent", `${event}${suffix}`, "app");
  }

  markModelRequest(provider: string, model: string, messages: Array<{ role?: string; content?: unknown }> | undefined, bodyBytes: number, workflow = "chat", subagent = false, attempt = 1, fileType?: string, fileSize?: number) {
    let selectedTextBytes = 0;
    let messagesCount = 0;
    let fullPayload = "";
    try {
      messagesCount = Array.isArray(messages) ? messages.length : 0;
      selectedTextBytes = Array.isArray(messages)
        ? messages.reduce((sum, m) => sum + (typeof m?.content === "string" ? m.content.length : JSON.stringify(m?.content ?? "").length), 0)
        : 0;
      fullPayload = Array.isArray(messages) ? JSON.stringify(messages, null, 0) : "";
    } catch {}
    const estimatedTokens = Math.ceil(selectedTextBytes / 4);
    this.add(
      "info",
      "ModelRequest",
      `provider=${redactSecrets(provider)} model=${redactSecrets(model)} fileType=${fileType || "none"} fileSize=${fileSize ?? 0} selectedTextBytes=${selectedTextBytes} estimatedTokens=${estimatedTokens} messages=${messagesCount} bodyBytes=${bodyBytes} workflow=${redactSecrets(workflow)} subagent=${!!subagent} attempt=${attempt}`,
      "agent"
    );
    // Full exact prompt/transcript to Log (secrets redacted inside add()).
    if (fullPayload) {
      this.add(
        "info",
        "ModelPrompt",
        `provider=${redactSecrets(provider)} model=${redactSecrets(model)} workflow=${redactSecrets(workflow)}\n${fullPayload}`,
        "agent"
      );
    }
  }

  /** Full model reply — never truncated at call-site; add() splits if needed. */
  markModelResponse(provider: string, model: string, content: string, durationMs?: number, meta?: string) {
    const text = content ?? "";
    this.add(
      "info",
      "ModelResponse",
      `provider=${redactSecrets(provider)} model=${redactSecrets(model)}` +
        (durationMs != null ? ` ${durationMs}ms` : "") +
        (meta ? ` ${meta}` : "") +
        ` chars=${text.length}\n${text}`,
      "agent"
    );
  }

  markNetwork(method: string, url: string, details?: unknown) {
    // Never persist authorization/API-key material.
    let safeUrl = redactSecrets(String(url));
    let suffix = "";
    if (details !== undefined) {
      try {
        const text = redactSecrets(JSON.stringify(details));
        suffix = ` ${text}`;
      } catch {}
    }
    this.add("debug", "Network", `${method.toUpperCase()} ${safeUrl}${suffix}`, "network");
  }

  clear() {
    this.clearedBeforeHydrate = true;
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    this.persistQueued = false;
    this.entries = [];
    this.notify();
    void AsyncStorage.removeItem(STORAGE_KEY).catch((error: unknown) => console.warn(`[AIB][storage] AsyncStorage remove failed for ${STORAGE_KEY}: ${error instanceof Error ? error.message : String(error)}`));
    void AsyncStorage.removeItem("aibuilder.log.persistent.v1").catch((error: unknown) => console.warn(`[AIB][storage] AsyncStorage remove failed for aibuilder.log.persistent.v1: ${error instanceof Error ? error.message : String(error)}`));
  }
}

export const persistentLogger = new PersistentLogger();
persistentLogger.installRuntimeCapture();
