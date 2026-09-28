import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from "react";
import { runShellCommand, subscribeTermuxOutput } from "../lib/termux-bridge";
import { subscribeTerminalOutput } from "../core/terminal/TerminalOutputBus";
import { getTermuxCommandQueueDepth, getTermuxQueueSnapshot } from "../lib/termux-command-queue";
import { createTerminalTab, nextTerminalTitle, type TerminalTab } from "../lib/terminal-tabs";

export interface TermuxConsoleLine {
  id: string;
  text: string;
  kind: "stdout" | "stderr" | "system" | "prompt";
  at: number;
}

interface TermuxConsoleContextType {
  visible: boolean;
  toggle: () => void;
  lines: TermuxConsoleLine[];
  command: string;
  setCommand: (value: string) => void;
  execute: () => Promise<void>;
  clear: () => void;
  history: string[];
  running: boolean;
  queueDepth: number;
  /** high-priority jobs waiting (interactive) */
  highPending: number;
  /** Multi-tab: independent drafts/history; output stream still shared from bridge */
  tabs: TerminalTab[];
  activeTabId: string;
  setActiveTabId: (id: string) => void;
  addTab: () => void;
  closeTab: (id: string) => void;
}

const TermuxConsoleContext = createContext<TermuxConsoleContextType | null>(null);

function splitLines(chunk: string): string[] {
  // Keep empty lines so the console matches Termux 1:1
  const parts = chunk.replace(/\r/g, "").split("\n");
  // Drop only a single trailing empty split artifact when chunk ends with \n
  if (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

let lineSeq = 0;
function nextId() {
  lineSeq += 1;
  return `${Date.now()}-${lineSeq}`;
}

export function TermuxConsoleProvider({ children }: { children: ReactNode }) {
  const [visible, setVisible] = useState(false);
  const [lines, setLines] = useState<TermuxConsoleLine[]>([]);
  const initialTab = createTerminalTab("Term 1");
  const [tabs, setTabs] = useState<TerminalTab[]>([initialTab]);
  const [activeTabId, setActiveTabId] = useState(initialTab.id);
  const [command, setCommandState] = useState("");
  const setCommand = useCallback((value: string) => {
    setCommandState(value);
    setTabs((prev) => prev.map((t) => (t.id === activeTabId ? { ...t, draft: value } : t)));
  }, [activeTabId]);
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [queueDepth, setQueueDepth] = useState(0);
  const [highPending, setHighPending] = useState(0);
  const streamBuffersRef = useRef<{ stdout: string; stderr: string }>({ stdout: "", stderr: "" });
  const liveOutputCountRef = useRef(0);
  const manualPendingRef = useRef(0);
  /** Dedup final mirror from bridge when live stream already delivered the same text. */
  const lastMirroredFingerprintRef = useRef<string>("");
  /** Avoid repeating the same $ prompt if both live and mirror fire. */
  const lastPromptRef = useRef<string>("");
  /** When true, next dispatch from bridge is skipped (we already painted "$ user input"). */
  const skipNextDispatchRef = useRef(false);

  const append = useCallback((text: string, kind: TermuxConsoleLine["kind"]) => {
    const next = splitLines(text);
    if (!next.length) return;
    if (kind === "stdout" || kind === "stderr") {
      liveOutputCountRef.current += next.length;
    }
    setLines((prev) =>
      [
        ...prev,
        ...next.map((line) => ({ id: nextId(), text: line, kind, at: Date.now() })),
      ].slice(-5000)
    );
  }, []);

  useEffect(
    () =>
      subscribeTermuxOutput((event) => {
        const stream = String(event.stream || "");
        const chunk = String(event.chunk || "");

        if (stream === "stdout" || stream === "stderr") {
          if (!chunk) return;
          const fp = `${stream}:${chunk}`;
          if (fp === lastMirroredFingerprintRef.current) return;
          lastMirroredFingerprintRef.current = fp;

          const kind = stream as "stdout" | "stderr";
          const buffers = streamBuffersRef.current;
          buffers[kind] += chunk;
          const normalized = buffers[kind].replace(/\r/g, "");
          const parts = normalized.split("\n");
          buffers[kind] = parts.pop() || "";
          if (parts.length) append(parts.join("\n"), kind);
          return;
        }

        if (stream === "lifecycle" && event.event && event.event !== "heartbeat") {
          // Flush partial buffers before status boundaries
          if (
            event.event === "finished" ||
            event.event === "timeout" ||
            event.event === "exception" ||
            event.event === "exit"
          ) {
            const buffers = streamBuffersRef.current;
            if (buffers.stdout) {
              append(buffers.stdout, "stdout");
              buffers.stdout = "";
            }
            if (buffers.stderr) {
              append(buffers.stderr, "stderr");
              buffers.stderr = "";
            }
          }

          // Prompt line: "$ command" only — hide workdir / native noise
          if (event.event === "dispatch") {
            const text = chunk.trim();
            if (!text) return;
            // Native bridge emits dispatch with only "workdir=/..." — never show it.
            // JS already emitted "$ <command>" via formatConsolePrompt.
            const stripped = text.replace(/^\$\s*/, "").trim();
            if (/^workdir=/.test(stripped) || /^workdir=/.test(text)) return;
            // Prefer a line that starts with "$ "
            const promptLine =
              text
                .split("\n")
                .map((l) => l.trim())
                .find((l) => l.startsWith("$ ") && !/^\$\s*workdir=/.test(l)) ||
              (text.startsWith("$ ") && !/^\$\s*workdir=/.test(text) ? text : null);
            if (!promptLine) return;
            if (skipNextDispatchRef.current) {
              skipNextDispatchRef.current = false;
              return;
            }
            if (promptLine === lastPromptRef.current) return;
            lastPromptRef.current = promptLine;
            append(promptLine, "prompt");
            return;
          }

          // Silent finished (used only to flush buffers)
          if (event.event === "finished" || event.event === "started") {
            return;
          }

          if (event.event === "exit") {
            const c = chunk.trim();
            if (c) append(c.startsWith("exit") ? c : `exit ${c}`, "system");
            return;
          }

          if (event.event === "exception") {
            append(chunk.trim() || "exception", "stderr");
            return;
          }

          if (event.event === "timeout") {
            append(chunk.trim() || "timeout", "system");
          }
        }
      }),
    [append]
  );

  useEffect(() => {
    const timer = setInterval(() => {
      setQueueDepth(getTermuxCommandQueueDepth());
      setHighPending(getTermuxQueueSnapshot().high);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  const clear = useCallback(() => {
    setLines([]);
    streamBuffersRef.current = { stdout: "", stderr: "" };
    liveOutputCountRef.current = 0;
    lastMirroredFingerprintRef.current = "";
    lastPromptRef.current = "";
    skipNextDispatchRef.current = false;
  }, []);

  const execute = useCallback(async () => {
    const raw = command.trim();
    if (!raw) return;
    setCommand("");
    setHistory((prev) => [raw, ...prev.filter((item) => item !== raw)].slice(0, 80));

    // Local console commands (no Termux needed) — behave like a real terminal.
    if (/^(clear|cls|clean)$/i.test(raw)) {
      clear();
      // Keep a single prompt line so the user sees the action was accepted.
      append(`$ ${raw}`, "prompt");
      return;
    }

    // Always send the exact typed command to Termux — no substitutions.
    const value = raw;

    manualPendingRef.current += 1;
    setRunning(true);
    lastMirroredFingerprintRef.current = "";
    lastPromptRef.current = "";
    try {
      // Show typed command; skip the bridge's duplicate "$ cmd" dispatch.
      append(`$ ${raw}`, "prompt");
      lastPromptRef.current = `$ ${raw}`;
      skipNextDispatchRef.current = true;
      await runShellCommand(value, { priority: "high", timeoutMs: 600_000 });
    } catch (error) {
      append(`${error instanceof Error ? error.message : String(error)}`, "stderr");
    } finally {
      manualPendingRef.current = Math.max(0, manualPendingRef.current - 1);
      setRunning(manualPendingRef.current > 0);
    }
  }, [append, command, clear]);

  const toggle = useCallback(() => {
    setVisible((current) => !current);
  }, []);



  const addTab = useCallback(() => {
    setTabs((prev) => {
      const tab = createTerminalTab(nextTerminalTitle(prev));
      setActiveTabId(tab.id);
      setCommandState(tab.draft);
      return [...prev, tab];
    });
  }, []);

  const closeTab = useCallback((id: string) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((t) => t.id !== id);
      if (id === activeTabId && next[0]) {
        setActiveTabId(next[0].id);
        setCommandState(next[0].draft);
      }
      return next;
    });
  }, [activeTabId]);

  const selectTab = useCallback((id: string) => {
    setTabs((prev) => {
      const t = prev.find((x) => x.id === id);
      if (t) setCommandState(t.draft);
      return prev;
    });
    setActiveTabId(id);
  }, []);

  const value = useMemo(
    () => ({
      visible,
      toggle,
      lines,
      command,
      setCommand,
      execute,
      clear,
      history,
      running,
      queueDepth,
      highPending,
      tabs,
      activeTabId,
      setActiveTabId: selectTab,
      addTab,
      closeTab,
    }),
    [visible, toggle, lines, command, setCommand, execute, clear, history, running, queueDepth, highPending, tabs, activeTabId, selectTab, addTab, closeTab]
  );

  useEffect(() => {
    return subscribeTerminalOutput((event) => {
      const kind = event.stream === "stderr" ? "stderr" : "stdout";
      if (event.data) append(event.data, kind);
    });
  }, [append]);

  return <TermuxConsoleContext.Provider value={value}>{children}</TermuxConsoleContext.Provider>;
}

export function useTermuxConsole() {
  const ctx = useContext(TermuxConsoleContext);
  if (!ctx) throw new Error("useTermuxConsole must be used within TermuxConsoleProvider");
  return ctx;
}
