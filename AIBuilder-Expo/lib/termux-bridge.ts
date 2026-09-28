import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription } from "react-native";
import { persistentLogger } from "./persistent-logger";
import { enqueueTermuxCommand, type TermuxQueuePriority } from "./termux-command-queue";

/**
 * Тонкая JS-обвязка над нативным модулем TermuxBridge (см.
 * plugins/withTermuxBridge.js). Сам модуль ничего не знает про чат/ИИ —
 * только "выполни эту команду в уже установленном Termux и дай результат".
 * Агентная логика (что именно выполнять и когда остановиться) — в
 * lib/termux-agent.ts.
 */

export interface TermuxCommandResult {
  commandId?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
}

export interface TermuxCommandOutputEvent {
  stream?: "stdout" | "stderr" | "lifecycle" | "heartbeat" | string;
  chunk?: string;
  event?: string;
  cmdId?: string;
}

export type TermuxOutputListener = (event: TermuxCommandOutputEvent & { cmdId?: string }) => void;

/**
 * JS-side fan-out for console UI. Native DeviceEventEmitter is best-effort
 * (can miss stdout when the app is backgrounded or when live am-broadcast
 * fails). Every runShellCommandNow also posts start/final events here so the
 * Termux console panel always shows `$ command` + final stdout/stderr for
 * BOTH manual console runs and AI-agent TERMUX_RUN commands.
 */
const jsConsoleListeners = new Set<TermuxOutputListener>();

export function emitJsConsoleEvent(event: TermuxCommandOutputEvent & { cmdId?: string }): void {
  for (const listener of jsConsoleListeners) {
    try {
      listener(event);
    } catch {
      /* ignore listener errors */
    }
  }
}

let liveEmitter: NativeEventEmitter | null = null;
export function subscribeTermuxOutput(listener: TermuxOutputListener): () => void {
  jsConsoleListeners.add(listener);
  let nativeUnsub: (() => void) | null = null;
  if (Platform.OS === "android" && getNative()) {
    try {
      liveEmitter ||= new NativeEventEmitter(NativeModules.TermuxBridge);
      const sub = liveEmitter.addListener("TermuxCommandOutput", listener);
      nativeUnsub = () => {
        try {
          sub.remove();
        } catch {
          /* ignore */
        }
      };
    } catch {
      nativeUnsub = null;
    }
  }
  return () => {
    jsConsoleListeners.delete(listener);
    nativeUnsub?.();
  };
}

export interface TermuxReadiness {
  ready: boolean;
  // Список конкретных причин, почему НЕ готово — используется, чтобы
  // показать пользователю понятную инструкцию, а не общее "не работает".
  reasons: Array<
    | "not_android"
    | "native_module_missing"
    | "termux_not_installed"
    | "run_command_permission_missing"
    | "run_command_probe_failed"
  >;
  /** true if a live echo probe was executed */
  probed?: boolean;
  /** detail from probe failure (stderr/timeout) */
  probeDetail?: string;
}

function getNative() {
  return NativeModules.TermuxBridge as
    | {
        isTermuxInstalled(): Promise<boolean>;
        hasRunCommandPermission(): Promise<boolean>;
        runCommand(
          command: string,
          workdir: string | null,
          timeoutMs: number
        ): Promise<TermuxCommandResult>;
        getSupportedAbis(): Promise<string[]>;
        getPackageVersion(packageName: string): Promise<string | null>;
        sha256File(fileUri: string): Promise<string>;
        canInstallPackages(): Promise<boolean>;
        openUnknownSourcesSettings(): Promise<boolean>;
        installApk(fileUri: string): Promise<boolean>;
        openPackage(packageName: string): Promise<boolean>;
        getContentUriSize(sourceUri: string): Promise<number>;
        importModelFile(
          sourceUri: string,
          destinationUri: string
        ): Promise<boolean>;
        exportModelToDirectory(
          llmUri: string,
          llmName: string,
          mmprojUri: string,
          mmprojName: string
        ): Promise<boolean>;
      }
    | undefined;
}

export function getTermuxNative() { return getNative(); }

export function isNativeModuleAvailable(): boolean {
  return Platform.OS === "android" && !!getNative();
}

/** Подписка на живой stdout/stderr Termux → лог приложения (как окно Termux). */
let streamSub: EmitterSubscription | null = null;
let streamRefCount = 0;
let streamBuf = "";
let streamKind: "stdout" | "stderr" = "stdout";

function flushStreamLines(force = false) {
  if (!streamBuf) return;
  const parts = streamBuf.split("\n");
  if (!force) streamBuf = parts.pop() || ""; else streamBuf = "";
  for (const line of parts) {
    const t = line.replace(/\r$/, "");
    if (!t) continue;
    persistentLogger.add(streamKind === "stderr" ? "warn" : "info", `Termux:${streamKind}`, t, "termux");
  }
  if (force && streamBuf.trim()) {
    persistentLogger.add(streamKind === "stderr" ? "warn" : "info", `Termux:${streamKind}`, streamBuf.replace(/\r$/, ""), "termux");
    streamBuf = "";
  }
}

function ensureTermuxStreamListener() {
  if (streamSub || Platform.OS !== "android") return;
  const native = getNative();
  if (!native) return;
  try {
    const emitter = new NativeEventEmitter(NativeModules.TermuxBridge);
    streamSub = emitter.addListener("TermuxCommandOutput", (ev: TermuxCommandOutputEvent) => {
      const stream = String(ev?.stream || "");
      const chunk = String(ev?.chunk || "");
      if (!chunk) return;
      if (stream === "lifecycle") {
        const evName = String(ev?.event || "event");
        // Everything Termux does is logged — dispatch/exit/exception at info
        // so Log screen shows them without requiring "debug" filter.
        const level =
          evName === "exception" || evName === "timeout"
            ? "error"
            : evName === "exit" || evName === "dispatch"
              ? "info"
              : "debug";
        persistentLogger.add(
          level as any,
          "Termux:lifecycle",
          `${evName} ${chunk}`.trim(),
          "termux"
        );
        return;
      }
      if (stream === "heartbeat") {
        // Still log heartbeats so long builds are fully accounted for in Log
        persistentLogger.add("info", "Termux:heartbeat", chunk, "termux");
        return;
      }
      // stdout/stderr — построчно в лог, как в окне Termux
      if (stream !== streamKind && streamBuf) flushStreamLines(true);
      if (stream === "stdout" || stream === "stderr") streamKind = stream;
      streamBuf += chunk;
      // flush complete lines
      if (streamBuf.includes("\n") || streamBuf.length > 4000) {
        flushStreamLines(false);
      }
    });
  } catch (e: unknown) {
    persistentLogger.add("warn", "TermuxBridge", `stream listener: ${String(e)}`);
  }
}

function retainTermuxStream() {
  streamRefCount++;
  ensureTermuxStreamListener();
}

function releaseTermuxStream() {
  streamRefCount = Math.max(0, streamRefCount - 1);
  flushStreamLines(true);
  if (streamRefCount === 0 && streamSub) {
    try { streamSub.remove(); } catch { /* ignore */ }
    streamSub = null;
  }
}


/**
 * Проверяет всё, что нужно для реальной работы Termux-сессии.
 * Намеренно НЕ проверяет allow-external-apps=true в termux.properties —
 * это невозможно узнать заранее, не выполнив хотя бы одну команду, поэтому
 * такая ошибка обрабатывается отдельно как результат первой попытки
 * запуска (см. lib/termux-agent.ts, translateTermuxError).
 */
export async function checkTermuxReadiness(
  opts?: { deep?: boolean }
): Promise<TermuxReadiness> {
  const reasons: TermuxReadiness["reasons"] = [];
  const deep = opts?.deep === true;

  if (Platform.OS !== "android") {
    return { ready: false, reasons: ["not_android"] };
  }

  const native = getNative();
  if (!native) {
    return { ready: false, reasons: ["native_module_missing"] };
  }

  const [installed, runCmdPerm] = await Promise.all([
    native.isTermuxInstalled().catch(() => false),
    native.hasRunCommandPermission().catch(() => false),
  ]);

  if (!installed) reasons.push("termux_not_installed");
  if (!runCmdPerm) reasons.push("run_command_permission_missing");

  // Light check: flags only (used by frequent UI polls).
  if (!deep || reasons.length > 0) {
    return { ready: reasons.length === 0, reasons, probed: false };
  }

  // Deep check: real RUN_COMMAND probe so "OK" means commands can run.
  let probeDetail: string | undefined;
  try {
    const r = await native.runCommand("echo AIBUILDER_OK", null, 15_000);
    const ok =
      !r.timedOut &&
      r.exitCode === 0 &&
      (r.stdout || "").includes("AIBUILDER_OK");
    if (!ok) {
      reasons.push("run_command_probe_failed");
      probeDetail = (
        r.timedOut
          ? "timeout"
          : (r.stderr || r.stdout || `exit ${r.exitCode}`).trim()
      ).slice(0, 240);
    }
  } catch (e: unknown) {
    reasons.push("run_command_probe_failed");
    probeDetail = (e instanceof Error ? e.message : String(e)).slice(0, 240);
  }

  return {
    ready: reasons.length === 0,
    reasons,
    probed: true,
    probeDetail,
  };
}


// Разрешение com.termux.permission.RUN_COMMAND запрашивается системным
// диалогом Android как обычное "опасное" разрешение — через
// PermissionsAndroid, а не через наш нативный модуль (у Android один
// стандартный способ запроса runtime-разрешений).
export async function requestRunCommandPermission(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const { PermissionsAndroid } = require("react-native");
    const result = await PermissionsAndroid.request(
      "com.termux.permission.RUN_COMMAND"
    );
    return result === PermissionsAndroid.RESULTS.GRANTED;
  } catch {
    return false;
  }
}

// Таймауты для разных типов операций (учитываем большие проекты):
// - Быстрая проверка (echo, ls): 15 секунд
// - Обычная команда: 600 секунд (10 минут)
// - Сборка APK / gradle / npm install больших деревьев: 1800 секунд (30 минут)
const DEFAULT_TIMEOUT_MS = 600_000;   // 10 минут для обычных команд
const QUICK_TIMEOUT_MS = 15_000;      // 15 секунд для проверок
const BUILD_TIMEOUT_MS = 1_800_000;   // 30 минут для сборки больших проектов

/** Эвристика: команда похожа на долгую сборку / установку зависимостей. */
function looksLikeLongRunningCommand(command: string): boolean {
  const c = (command || "").toLowerCase().trim();
  // Проверки идемпотентности / probe — всегда короткие
  if (
    /\baib_installed\b/.test(c) ||
    /\baibuilder_ok\b/.test(c) ||
    /\baib_missing\b/.test(c) ||
    /^command\s+-v\b/.test(c) ||
    /\(command\s+-v\b/.test(c) ||
    /^test\s+-[a-z]/.test(c) ||
    /\(test\s+-[a-z]/.test(c) ||
    /\bdpkg\s+-s\b/.test(c) ||
    /\becho\s+aib/i.test(c) ||
    /\bpreflight_ok\b/.test(c) ||
    /\bfree_mb=/.test(c)
  ) {
    return false;
  }
  return (
    /\b(gradlew|gradle)\b/.test(c) ||
    /\bassemble(debug|release)?\b/.test(c) ||
    /\bnpm\s+(i|install|ci|run)\b/.test(c) ||
    /\byarn\s+(install|add)\b/.test(c) ||
    /\bpnpm\s+(i|install|run)\b/.test(c) ||
    /\b(expo|npx)\s+(prebuild|run:android|run)\b/.test(c) ||
    /\bsdkmanager\b/.test(c) ||
    /\b(kotlinc|javac)\b/.test(c) ||
    /\bmvn\b/.test(c) ||
    /\bcargo\s+build\b/.test(c) ||
    /\bpkg\s+install\b/.test(c) ||
    /\bapt-get\b/.test(c)
  );
}

/**
 * Выполняет одну shell-команду в Termux и ждёт результат.
 * Бросает исключение с понятным кодом в message, если Termux-сессия не
 * готова (см. checkTermuxReadiness) — вызывающая сторона (lib/termux-agent)
 * сама решает, как показать это пользователю/модели.
 */

/** Short, terminal-like prompt for the console panel (hide huge scripts). */
function formatConsolePrompt(command: string): string {
  // Full command, no truncation — user must see exactly what Termux runs.
  const raw = String(command || "").replace(/\r/g, "");
  const lines = raw.split("\n");
  if (lines.length <= 1) return `$ ${raw}`;
  return lines.map((l, i) => (i === 0 ? `$ ${l}` : l)).join("\n");
}

/** Commands longer than this are written to $HOME and executed via bash path (priority #1). */
const LONG_COMMAND_THRESHOLD = 1200;
const LONG_CMD_SCRIPT = "$HOME/aibuilder-scripts/aib-long-cmd.sh";

async function runLongCommandViaFile(
  command: string,
  native: NonNullable<ReturnType<typeof getNative>>,
  timeout: number,
  workdir: string | null,
  commandId: string,
): Promise<TermuxCommandResult> {
  // Write via short chunks of base64 to avoid binder limits
  const b64 =
    typeof Buffer !== "undefined"
      ? Buffer.from(command, "utf8").toString("base64")
      : (() => {
          const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
          const bytes = unescape(encodeURIComponent(command));
          let out = "";
          for (let i = 0; i < bytes.length; i += 3) {
            const a = bytes.charCodeAt(i);
            const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0;
            const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
            out += chars[a >> 2];
            out += chars[((a & 3) << 4) | (b >> 4)];
            out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
            out += i + 2 < bytes.length ? chars[c & 63] : "=";
          }
          return out;
        })();
  const chunkSize = 2400;
  // Unique per commandId — concurrent builds must not clobber the same script file
  const safeId = String(commandId || "x").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || "x";
  const scriptPath = `$HOME/aibuilder-scripts/aib-long-cmd-${safeId}.sh`;
  const prep = await native.runCommand(
    `mkdir -p "$HOME/aibuilder-scripts" && : > "${scriptPath}" && echo PREP_OK`,
    null,
    15_000,
  );
  if (prep.exitCode !== 0 && !(prep.stdout || "").includes("PREP_OK")) {
    persistentLogger.add("warn", "TermuxBridge", `long-cmd prep failed: ${prep.stderr || prep.stdout}`);
    // fall through to direct execution
    return native.runCommand(command, workdir, timeout);
  }
  for (let i = 0; i < b64.length; i += chunkSize) {
    const c = b64.slice(i, i + chunkSize);
    const r = await native.runCommand(`printf '%s' '${c}' | base64 -d >> "${scriptPath}"`, null, 15_000);
    if (r.exitCode !== 0) {
      persistentLogger.add("error", "TermuxBridge", `long-cmd chunk fail at ${i}`);
      return native.runCommand(command, workdir, timeout);
    }
  }
  await native.runCommand(`chmod +x "${scriptPath}" 2>/dev/null || true`, null, 10_000);
  // Построчный stdout — иначе heartbeat «stdout 0 байт» при живом Gradle
  // Cleanup script after run (best-effort) to avoid filling $HOME
  const launch =
    `if command -v stdbuf >/dev/null 2>&1; then stdbuf -oL -eL bash "${scriptPath}"; ` +
    `else bash "${scriptPath}"; fi; EC=$?; rm -f "${scriptPath}" 2>/dev/null || true; exit $EC`;
  persistentLogger.add("info", "TermuxBridge", `long-cmd via file id=${commandId} path=${scriptPath} len=${command.length}`);
  return native.runCommand(launch, workdir, timeout);
}

async function runShellCommandNow(
  command: string,
  opts?: { workdir?: string; timeoutMs?: number; isBuild?: boolean }
): Promise<TermuxCommandResult> {
  const native = getNative();
  if (!native) {
    persistentLogger.add("error", "TermuxBridge", "TERMUX_NATIVE_MODULE_MISSING");
    throw new Error("TERMUX_NATIVE_MODULE_MISSING");
  }

  // Автоматическое определение таймаута по типу команды
  let timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (opts?.isBuild === true || looksLikeLongRunningCommand(command)) {
    timeout = Math.max(timeout, BUILD_TIMEOUT_MS);
  }

  const t0 = Date.now();
  const commandId = `js-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Полная команда в лог (как будто набрали в Termux)
  persistentLogger.add(
    "info",
    "Termux",
    `$ ${command}`
  );
  persistentLogger.add(
    "debug",
    "TermuxBridge",
    `→ start id=${commandId} timeout=${timeout}ms workdir=${opts?.workdir || "(default)"}`
  );

  // Terminal-style prompt: full command, no truncation.
  emitJsConsoleEvent({
    stream: "lifecycle",
    event: "dispatch",
    chunk: formatConsolePrompt(command),
    cmdId: commandId,
  });

  retainTermuxStream();
  try {
    // File path only for truly long payloads — short multi-line launch cmds stay direct
    const useFile =
      command.length > LONG_COMMAND_THRESHOLD ||
      (command.length > 800 && command.includes("\n"));
    const result = useFile
      ? await runLongCommandViaFile(command, native, timeout, opts?.workdir || null, commandId)
      : await native.runCommand(
          command,
          opts?.workdir || null,
          timeout
        );
    // The native callback is authoritative: the event stream is best-effort
    // and older Termux/Android combinations may not deliver DeviceEventEmitter
    // output while the app is backgrounded. Always mirror the final callback
    // stdout/stderr into the persistent app log so the Log screen/export has the
    // complete command transcript even when the live stream was unavailable.
    const stdout = String(result.stdout || "");
    const stderr = String(result.stderr || "");
    // Always persist full Termux transcript into AI Builder Log (no omissions).
    if (stdout) {
      persistentLogger.add("info", `Termux:${commandId}:stdout`, stdout, "termux");
    } else {
      persistentLogger.add("info", `Termux:${commandId}:stdout`, "(empty)", "termux");
    }
    if (stderr) {
      persistentLogger.add("warn", `Termux:${commandId}:stderr`, stderr, "termux");
    }
    flushStreamLines(true);

    // Authoritative final mirror into console UI (covers missing live am-broadcast).
    // Use a distinct lifecycle marker so ConsoleContext can flush buffers first.
    // Flush lifecycle "finished" silently — console only shows real stdout/stderr.
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "finished",
      chunk: "",
      cmdId: result.commandId || commandId,
    });
    if (stdout) {
      emitJsConsoleEvent({
        stream: "stdout",
        chunk: stdout.endsWith("\n") ? stdout : stdout + "\n",
        cmdId: result.commandId || commandId,
      });
    }
    if (stderr) {
      emitJsConsoleEvent({
        stream: "stderr",
        chunk: stderr.endsWith("\n") ? stderr : stderr + "\n",
        cmdId: result.commandId || commandId,
      });
    }
    // Always show exit status like a real shell (full visibility).
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "exit",
      chunk: result.timedOut
        ? `exit ${result.exitCode} (timeout)`
        : `exit ${result.exitCode}`,
      cmdId: result.commandId || commandId,
    });

    const ms = Date.now() - t0;
    const noOutput =
      result.exitCode !== 0 &&
      !result.timedOut &&
      stdout.length === 0 &&
      stderr.length === 0;
    if (noOutput) {
      persistentLogger.add(
        "error",
        "Termux",
        `TERMUX_NO_OUTPUT id=${commandId} exit=${result.exitCode} (${ms}ms) cmdLen=${command.length}`,
        "termux"
      );
    }
    persistentLogger.add(
      result.exitCode === 0 && !result.timedOut ? "info" : "warn",
      "Termux",
      `← end id=${commandId} exit=${result.exitCode}` +
        (result.timedOut ? " TIMEOUT" : "") +
        (noOutput ? " TERMUX_NO_OUTPUT" : "") +
        ` (${ms}ms, out=${stdout.length}b err=${stderr.length}b, cmdLen=${command.length})`,
      "termux"
    );
    return {
      ...result,
      commandId: result.commandId || commandId,
      stderr: noOutput
        ? `TERMUX_NO_OUTPUT: exit=${result.exitCode}, empty stdout/stderr, cmdLen=${command.length}. ` +
          `Канал Termux не вернул вывод (лимит длины команды / ранняя ошибка).`
        : result.stderr,
    };
  } catch (e: unknown) {
    flushStreamLines(true);
    const ms = Date.now() - t0;
    const msg = e instanceof Error ? e.message : String(e);
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "exception",
      chunk: msg,
      cmdId: commandId,
    });
    // Setup/permission failures are expected after reinstall until allow-external-apps
    // and RUN_COMMAND are granted — log as warn so the log banner does not scream "crash".
    const isSetup =
      /SecurityException|allow-external|RUN_COMMAND|Not allowed to start service/i.test(msg);
    persistentLogger.add(
      isSetup ? "warn" : "error",
      "Termux",
      `← exception id=${commandId} ${ms}ms: ${msg}`,
      "termux"
    );
    throw e;
  } finally {
    releaseTermuxStream();
  }
}

export function runShellCommand(
  command: string,
  opts?: {
    workdir?: string;
    timeoutMs?: number;
    isBuild?: boolean;
    /** high = interactive Termux panel; runs before pending agent/script jobs */
    priority?: TermuxQueuePriority;
  }
): Promise<TermuxCommandResult> {
  return enqueueTermuxCommand(
    () => runShellCommandNow(command, opts),
    { priority: opts?.priority }
  );
}

/**
 * Проверяет, что реально можно выполнить команду в Termux (не только permissions).
 * Возвращает null при успехе или текст понятной ошибки.
 */
export async function probeTermuxCommand(): Promise<string | null> {
  try {
    const r = await runShellCommand("echo AIBUILDER_OK", { timeoutMs: QUICK_TIMEOUT_MS });
    if (r.timedOut) {
      return "timeout";
    }
    if ((r.stdout || "").includes("AIBUILDER_OK") && r.exitCode === 0) {
      return null;
    }
    const detail = (r.stderr || r.stdout || `exit ${r.exitCode}`).trim();
    return detail || "empty_result";
  } catch (e: unknown) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** Короткая классификация типичных сбоев RUN_COMMAND для UI. */
export function classifyTermuxFailure(raw: string): {
  code:
    | "permission"
    | "allow_external"
    | "not_installed"
    | "service"
    | "timeout"
    | "unknown";
  hintKey: string;
} {
  const m = (raw || "").toLowerCase();
  if (m.includes("not_android") || m.includes("termux_native_module_missing")) {
    return { code: "not_installed", hintKey: "packTermuxNotReady" };
  }
  if (
    m.includes("unable to start service") ||
    m.includes("run_command") ||
    m.includes("allow-external") ||
    m.includes("illegalstateexception")
  ) {
    return { code: "service", hintKey: "termuxSetupHintMessage" };
  }
  if (m.includes("securityexception") || m.includes("permission")) {
    return { code: "permission", hintKey: "termuxReasonPermissionMissing" };
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return { code: "timeout", hintKey: "termuxSetupHintMessage" };
  }
  return { code: "unknown", hintKey: "termuxSetupHintMessage" };
}

