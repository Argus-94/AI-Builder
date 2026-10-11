import { NativeModules, NativeEventEmitter, Platform, EmitterSubscription, Linking } from "react-native";
import { persistentLogger } from "./persistent-logger";
import { enqueueTermuxCommand, type TermuxQueuePriority , clearPendingTermuxQueue } from "./termux-command-queue";
import { getBuildBackend, backendLabel, type AgentShellBackend } from "./agent-shell-backend";
import { classifyCommandForDiagnostics, redactCommandForLogs, redactCommandOutputForLogs, summarizeCommandOutputForLogs } from "./command-log-redaction";
import { classifyDiagnosticError, createTraceCorrelationId, isExplicitTermuxExternalAppsFalse } from "./diagnostic-trace";
import { isAndroidRunCommandPermissionDenied, runCommandPermissionStatus, RunCommandPermissionGate } from "./termux-permission-gate";

/**
 * Тонкая JS-обвязка над нативным модулем TermuxBridge (см.
 * plugins/withTermuxBridge.js). Сам модуль ничего не знает про чат/ИИ —
 * только "выполни эту команду в уже установленном Termux и дай результат".
 * Агентная логика (что именно выполнять и когда остановиться) — в
 * lib/termux-agent.ts.
 */

export interface TermuxCommandResult {
  commandId?: string;
  /** Native UUID retained separately from the caller-visible JS correlation ID. */
  nativeCommandId?: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  timedOut: boolean;
  /** Android RUN_COMMAND may truncate callback bundles; such output is not probe evidence. */
  outputTruncated?: boolean;
}

export interface TermuxCommandOutputEvent {
  stream?: "stdout" | "stderr" | "lifecycle" | "heartbeat" | string;
  chunk?: string;
  event?: string;
  cmdId?: string;
  nativeCmdId?: string;
  elapsedSec?: number;
  stdoutBytes?: number;
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
    | "termux_install_check_failed"
    | "run_command_permission_missing"
    | "run_command_permission_check_failed"
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
          timeoutMs: number,
          backendLabel?: string,
          clientCommandId?: string,
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

function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0) ?? 0;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}

/** Reject malformed or absent native callback payloads instead of letting an
 * accidental `null` become a success-shaped empty result or an opaque TypeError. */
export function normalizeNativeCommandResult(value: unknown, clientCommandId: string): TermuxCommandResult {
  if (!value || typeof value !== "object") {
    throw new Error("TERMUX_NATIVE_RESULT_MISSING: RUN_COMMAND returned no result object");
  }
  const result = value as Record<string, unknown>;
  if (
    typeof result.stdout !== "string" ||
    typeof result.stderr !== "string" ||
    typeof result.exitCode !== "number" || !Number.isFinite(result.exitCode) ||
    typeof result.timedOut !== "boolean"
  ) {
    throw new Error("TERMUX_NATIVE_RESULT_INVALID: RUN_COMMAND callback omitted required result fields");
  }
  const returnedCommandId = typeof result.commandId === "string" && result.commandId ? result.commandId : undefined;
  if (returnedCommandId && /^(?:js|tr)-/.test(returnedCommandId) && returnedCommandId !== clientCommandId) {
    throw new Error("TERMUX_NATIVE_RESULT_ID_MISMATCH: callback belongs to a different JavaScript command");
  }
  if (result.nativeCommandId !== undefined && (typeof result.nativeCommandId !== "string" || !/^[a-f0-9]{32}$/.test(result.nativeCommandId))) {
    throw new Error("TERMUX_NATIVE_RESULT_NATIVE_ID_INVALID: callback UUID is malformed");
  }
  const nativeCommandId = typeof result.nativeCommandId === "string" && result.nativeCommandId
    ? result.nativeCommandId
    : returnedCommandId && returnedCommandId !== clientCommandId ? returnedCommandId : undefined;
  return {
    commandId: clientCommandId,
    ...(nativeCommandId ? { nativeCommandId } : {}),
    stdout: result.stdout,
    stderr: result.stderr,
    exitCode: result.exitCode,
    timedOut: result.timedOut,
    ...(result.outputTruncated === true ? { outputTruncated: true } : {}),
  };
}

async function invokeNativeRunCommand(
  native: NonNullable<ReturnType<typeof getNative>>,
  command: string,
  workdir: string | null,
  timeoutMs: number,
  backendLabel: string,
  clientCommandId: string,
): Promise<TermuxCommandResult> {
  const raw = await native.runCommand(command, workdir, timeoutMs, backendLabel, clientCommandId);
  const result = normalizeNativeCommandResult(raw, clientCommandId);
  if ((result.stderr || "").includes("AIB_COMMAND_CANCELLED")) {
    throw new Error("ABORTED");
  }
  return result;
}

const runCommandPermissionGate = new RunCommandPermissionGate();
let lastPermissionGateWarningAt = 0;
let lastPermissionBlockedTraceAt = 0;
let deepReadinessProbePending: Promise<TermuxReadiness> | null = null;
let deepReadinessProbeCache: { value: TermuxReadiness; checkedAt: number } | null = null;
const DEEP_READINESS_READY_TTL_MS = 3_000;
const DEEP_READINESS_FAILURE_TTL_MS = 30_000;

async function readRunCommandPermission(
  native: NonNullable<ReturnType<typeof getNative>>,
  forceRefresh = false,
): Promise<boolean> {
  return runCommandPermissionGate.check(() => native.hasRunCommandPermission(), forceRefresh);
}

export function isNativeModuleAvailable(): boolean {
  return Platform.OS === "android" && !!getNative();
}

/** Подписка на живой stdout/stderr Termux → лог приложения (как окно Termux). */
let streamSub: EmitterSubscription | null = null;
let streamRefCount = 0;
/** Correlates native live output with the command/backend that produced it. */
const commandContexts = new Map<string, { backend: string; label: string; startedAt: number; command: string }>();
const commandStreamBuffers = new Map<string, { kind: "stdout" | "stderr"; buf: string }>();
const commandStreamSummaries = new Map<string, { stdoutChars: number; stderrChars: number; stdoutBytes: number; stderrBytes: number; markers: Set<string> }>();
let lastUnmatchedOutputTraceAt = 0;

function addStreamSummary(cmdId: string, kind: "stdout" | "stderr", text: string) {
  const summary = commandStreamSummaries.get(cmdId) || { stdoutChars: 0, stderrChars: 0, stdoutBytes: 0, stderrBytes: 0, markers: new Set<string>() };
  if (kind === "stdout") { summary.stdoutChars += text.length; summary.stdoutBytes += utf8ByteLength(text); }
  else { summary.stderrChars += text.length; summary.stderrBytes += utf8ByteLength(text); }
  const safe = summarizeCommandOutputForLogs("", text);
  const match = safe.match(/\[SAFE_MARKERS ([^\]]+)\]/);
  if (match) for (const marker of match[1].split(" ")) summary.markers.add(marker);
  commandStreamSummaries.set(cmdId, summary);
}

function persistCommandStreamSummary(cmdId: string) {
  const summary = commandStreamSummaries.get(cmdId);
  commandStreamSummaries.delete(cmdId);
  if (!summary) return;
  const ctx = commandContexts.get(cmdId);
  const isLinux = !!ctx && ctx.backend !== "termux";
  const tag = isLinux ? `Linux:${ctx!.label}:${cmdId}:stream-summary` : `Termux:${cmdId}:stream-summary`;
  const markers = [...summary.markers].slice(0, 32);
  persistentLogger.add(summary.stderrChars ? "warn" : "info", tag,
    `metricSource=live-stream-transport stdoutStreamChars=${summary.stdoutChars} stdoutStreamUtf8Bytes=${summary.stdoutBytes} stderrStreamChars=${summary.stderrChars} stderrStreamUtf8Bytes=${summary.stderrBytes}${markers.length ? ` safeMarkers=${markers.join(",")}` : ""}`,
    isLinux ? "linux" : "termux");
}

function flushCommandStream(cmdId: string, force = false) {
  const state = commandStreamBuffers.get(cmdId);
  if (!state || !state.buf) return;
  const parts = state.buf.split("\n");
  if (!force) state.buf = parts.pop() || ""; else state.buf = "";
  for (const line of parts) {
    const t = line.replace(/\r$/, "");
    if (t) addStreamSummary(cmdId, state.kind, t);
  }
  if (force && state.buf.trim()) {
    addStreamSummary(cmdId, state.kind, state.buf.replace(/\r$/, ""));
    state.buf = "";
  }
}

function flushAllCommandStreams(force = false) {
  for (const cmdId of commandStreamBuffers.keys()) flushCommandStream(cmdId, force);
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
      const cmdId = ev?.cmdId ? String(ev.cmdId) : undefined;
      const ctx = cmdId ? commandContexts.get(cmdId) : undefined;
      if (stream === "lifecycle") {
        const evName = String(ev?.event || "event");
        // Everything the host/guest shell does is logged. Linux proot gets its
        // own namespace so Debian/Ubuntu diagnostics are not indistinguishable
        // from native Termux output.
        const level =
          evName === "exception" || evName === "timeout"
            ? "error"
            : evName === "exit" || evName === "dispatch"
              ? "info"
              : "debug";
        const backend = ctx?.backend ?? "termux";
        const commandKind = classifyCommandForDiagnostics(ctx?.command ?? "");
        const exitCode = Number(chunk.match(/\bexit=(-?\d+)\b/)?.[1]);
        const timeoutMs = Number(chunk.match(/\btimeoutMs=(\d+)\b/)?.[1]);
        const safeEvent = ["dispatch", "started", "timeout", "callback-error", "finished", "exception", "exit"].includes(evName) ? evName : "event";
        const exceptionCategory = safeEvent === "exception" ? classifyDiagnosticError(chunk) : undefined;
        persistentLogger.trace({
          correlationId: cmdId || "unknown",
          commandId: cmdId,
          nativeCommandId: ev?.nativeCmdId,
          action: `command.${commandKind}`,
          step: `native.${safeEvent}`,
          status: safeEvent === "timeout" ? "timed_out" : safeEvent === "exception" || safeEvent === "callback-error" ? "failed" : safeEvent === "dispatch" || safeEvent === "started" ? "started" : "progress",
          backend: backend === "ubuntu-proot" ? backend : "termux",
          target: backend === "ubuntu-proot" ? "ubuntu" : "termux",
          screen: commandKind === "rootfs-probe" || commandKind === "rootfs-install" ? "runtime" : "termux",
          ...(Number.isFinite(exitCode) ? { exitCode } : {}),
          ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
          ...(typeof ev?.elapsedSec === "number" ? { durationMs: ev.elapsedSec * 1000 } : {}),
          ...(typeof ev?.stdoutBytes === "number" ? { stdoutBytes: ev.stdoutBytes } : {}),
          ...(exceptionCategory ? { errorCategory: exceptionCategory } : {}),
        });
        persistentLogger.add(level as any, backend !== "termux" ? `Linux:${ctx!.label}:lifecycle` : "Termux:lifecycle", `event=${safeEvent} cmdId=${cmdId || "?"}${exceptionCategory ? ` errorCategory=${exceptionCategory}` : ""}${Number.isFinite(exitCode) ? ` exitCode=${exitCode}` : ""}${Number.isFinite(timeoutMs) && timeoutMs > 0 ? ` timeoutMs=${timeoutMs}` : ""}`, backend !== "termux" ? "linux" : "termux");
        return;
      }
      if (stream === "heartbeat") {
        const backend = ctx?.backend ?? "termux";
        const isLinux = backend === "ubuntu-proot";
        const commandKind = classifyCommandForDiagnostics(ctx?.command ?? "");
        persistentLogger.trace({
          correlationId: cmdId || "unknown",
          commandId: cmdId,
          action: "command.progress",
          step: "native.heartbeat",
          status: "progress",
          backend: isLinux ? backend : "termux",
          target: isLinux ? "ubuntu" : "termux",
          screen: commandKind === "rootfs-probe" || commandKind === "rootfs-install" ? "runtime" : "termux",
          ...(typeof ev?.elapsedSec === "number" ? { durationMs: ev.elapsedSec * 1000 } : {}),
          ...(typeof ev?.stdoutBytes === "number" ? { stdoutBytes: ev.stdoutBytes } : {}),
        });
        return;
      }
      // stdout/stderr — сохраняем построчно и привязываем к конкретной
      // команде. Для Debian/Ubuntu это позволяет отличить guest output от
      // host Termux и не смешивать параллельные команды.
      if (stream === "stdout" || stream === "stderr") {
        if (!cmdId) {
          const now = Date.now();
          if (now - lastUnmatchedOutputTraceAt > 60_000) {
            lastUnmatchedOutputTraceAt = now;
            persistentLogger.trace({ correlationId: createTraceCorrelationId("unmatched"), action: "command.output", step: "native.unmatched-stream", status: "progress", backend: "native", target: "termux", screen: "termux" });
          }
          return;
        }
        const state = commandStreamBuffers.get(cmdId) || { kind: stream, buf: "" };
        if (state.kind !== stream) {
          flushCommandStream(cmdId, true);
          state.kind = stream;
          state.buf = "";
        }
        state.buf += chunk;
        commandStreamBuffers.set(cmdId, state);
        if (state.buf.includes("\n") || state.buf.length > 4000) flushCommandStream(cmdId, false);
      }
    });
  } catch (e: unknown) {
    persistentLogger.add("warn", "TermuxBridge", `stream listener unavailable errorCategory=${classifyDiagnosticError(e)}`);
  }
}

function retainTermuxStream() {
  streamRefCount++;
  ensureTermuxStreamListener();
}

function releaseTermuxStream() {
  streamRefCount = Math.max(0, streamRefCount - 1);
  flushAllCommandStreams(true);
  if (streamRefCount === 0 && streamSub) {
    try { streamSub.remove(); } catch { /* ignore */ }
    streamSub = null;
  }
}


/**
 * Проверяет всё, что нужно для реальной работы Termux-сессии.
 * Настройку Termux allow-external-apps нельзя прочитать через Android API:
 * для неё выполняется отдельная безопасная echo-проба. Проба запускается только
 * после подтверждения package-scoped Android RUN_COMMAND permission.
 */
export async function checkTermuxReadiness(
  opts?: { deep?: boolean; refreshPermission?: boolean }
): Promise<TermuxReadiness> {
  if (opts?.deep !== true) return checkTermuxReadinessOnce(opts);
  const forceRefresh = opts.refreshPermission === true;
  if (forceRefresh) deepReadinessProbeCache = null;
  if (!forceRefresh && deepReadinessProbeCache) {
    const ttl = deepReadinessProbeCache.value.ready ? DEEP_READINESS_READY_TTL_MS : DEEP_READINESS_FAILURE_TTL_MS;
    if (Date.now() - deepReadinessProbeCache.checkedAt < ttl) return deepReadinessProbeCache.value;
  }
  if (deepReadinessProbePending) return deepReadinessProbePending;
  const pending = checkTermuxReadinessOnce(opts);
  deepReadinessProbePending = pending;
  try {
    const value = await pending;
    deepReadinessProbeCache = { value, checkedAt: Date.now() };
    return value;
  } finally {
    if (deepReadinessProbePending === pending) deepReadinessProbePending = null;
  }
}

async function checkTermuxReadinessOnce(
  opts?: { deep?: boolean; refreshPermission?: boolean }
): Promise<TermuxReadiness> {
  const traceId = createTraceCorrelationId("termux-readiness");
  const traceBase = { correlationId: traceId, action: "termux.readiness", backend: "termux" as const, target: "termux" as const, screen: "runtime" as const };
  persistentLogger.trace({ ...traceBase, step: "readiness.start", status: "started", termuxExternalApps: "not-observed" });
  const reasons: TermuxReadiness["reasons"] = [];
  const deep = opts?.deep === true;

  if (Platform.OS !== "android") {
    persistentLogger.trace({ ...traceBase, step: "readiness.platform", status: "blocked", resultCode: "unknown" });
    return { ready: false, reasons: ["not_android"] };
  }

  const native = getNative();
  if (!native) {
    persistentLogger.trace({ ...traceBase, step: "readiness.native-module", status: "failed", errorCategory: "native-module-missing", resultCode: "unknown" });
    return { ready: false, reasons: ["native_module_missing"] };
  }

  const [installedResult, permissionResult] = await Promise.allSettled([
    native.isTermuxInstalled(),
    readRunCommandPermission(native, opts?.refreshPermission === true),
  ]);

  const installed = installedResult.status === "fulfilled" ? installedResult.value : false;
  const runCmdPerm = permissionResult.status === "fulfilled" ? permissionResult.value : false;
  persistentLogger.trace({
    ...traceBase,
    step: "readiness.android-permissions",
    status: permissionResult.status === "fulfilled" ? "succeeded" : "failed",
    androidRunCommand: permissionResult.status === "fulfilled" ? runCmdPerm ? "granted" : "missing" : "unknown",
    termuxExternalApps: "not-observed",
    resultCode: permissionResult.status === "fulfilled" && runCmdPerm ? "available" : "unknown",
    ...(permissionResult.status === "rejected" || !runCmdPerm ? { errorCategory: permissionResult.status === "rejected" ? classifyDiagnosticError(permissionResult.reason) : "permission-denied" as const } : {}),
  });
  if (installedResult.status === "rejected") reasons.push("termux_install_check_failed");
  else if (!installed) reasons.push("termux_not_installed");
  if (permissionResult.status === "rejected") reasons.push("run_command_permission_check_failed");
  else if (!runCmdPerm) reasons.push("run_command_permission_missing");

  // Light check: flags only (used by frequent UI polls).
  if (!deep || reasons.length > 0) {
    const blockers = reasons.includes("run_command_permission_missing")
      ? runCommandPermissionStatus("RUN_COMMAND_PERMISSION_MISSING")
      : reasons.includes("run_command_permission_check_failed")
        ? runCommandPermissionStatus("RUN_COMMAND_PERMISSION_CHECK_FAILED")
        : reasons.length ? `prerequisites not satisfied: ${reasons.join(", ")}` : undefined;
    const ready = reasons.length === 0;
    persistentLogger.trace({ ...traceBase, step: "readiness.result", status: ready ? "succeeded" : "blocked", resultCode: ready ? "ready" : "unknown", ...(!ready && reasons.some((reason) => reason.includes("permission")) ? { errorCategory: "permission-denied" as const } : {}) });
    return { ready, reasons, probed: false, probeDetail: deep ? blockers : undefined };
  }

  // Deep check: real RUN_COMMAND probe so "OK" means commands can run.
  let probeDetail: string | undefined;
  let probeCommandId: string | undefined;
  const probeStartedAt = Date.now();
  try {
    probeCommandId = `${traceId}-probe`;
    persistentLogger.trace({ ...traceBase, commandId: probeCommandId, action: "termux.readiness-probe", step: "native.dispatch", status: "started", timeoutMs: 15_000 });
    const raw = await native.runCommand("echo AIBUILDER_OK", null, 15_000, "Termux", probeCommandId);
    const r = normalizeNativeCommandResult(raw, probeCommandId);
    const transcript = `${r.stderr || ""}\n${r.stdout || ""}`.trim();
    const ok =
      !r.timedOut &&
      !r.outputTruncated &&
      r.exitCode === 0 &&
      (r.stdout || "").includes("AIBUILDER_OK");
    persistentLogger.trace({ ...traceBase, commandId: probeCommandId, nativeCommandId: r.nativeCommandId, action: "termux.readiness-probe", step: "native.result", status: ok ? "succeeded" : r.timedOut ? "timed_out" : "failed", durationMs: Date.now() - probeStartedAt, timeoutMs: 15_000, exitCode: r.exitCode, stdoutBytes: utf8ByteLength(r.stdout), stderrBytes: utf8ByteLength(r.stderr), resultCode: ok ? "ready" : r.outputTruncated ? "truncated" : r.stdout.length === 0 && r.stderr.length === 0 ? "empty" : "unknown", ...(!ok ? { errorCategory: r.timedOut ? "timeout" as const : r.outputTruncated ? "output-truncated" as const : classifyDiagnosticError(transcript) } : {}) });
    if (isAndroidRunCommandPermissionDenied(transcript)) {
      runCommandPermissionGate.remember(false);
      deepReadinessProbeCache = null;
      reasons.push("run_command_permission_missing");
      probeDetail = runCommandPermissionStatus(transcript).slice(0, 360);
    } else if (!ok) {
      reasons.push("run_command_probe_failed");
      probeDetail = (
        r.timedOut
          ? "RUN_COMMAND probe timed out"
          : r.outputTruncated
            ? "RUN_COMMAND probe output was truncated; readiness cannot be confirmed"
            : transcript || `RUN_COMMAND probe returned exit=${r.exitCode} with empty stdout/stderr; no success marker was received`
      ).slice(0, 240);
    }
  } catch (e: unknown) {
    const raw = e instanceof Error ? e.message : String(e);
    const deniedExternalApps = isExplicitTermuxExternalAppsFalse(raw);
    const permissionDenied = isAndroidRunCommandPermissionDenied(raw);
    const timedOut = /timeout|timed\s*out|deadline/i.test(raw);
    const cancelled = /cancel|abort|interrupt/i.test(raw);
    persistentLogger.trace({
      ...traceBase,
      ...(probeCommandId ? { commandId: probeCommandId } : {}),
      action: "termux.readiness-probe",
      step: "native.result",
      status: permissionDenied || deniedExternalApps ? "blocked" : timedOut ? "timed_out" : cancelled ? "cancelled" : "failed",
      durationMs: Date.now() - probeStartedAt,
      timeoutMs: 15_000,
      resultCode: "unavailable",
      errorCategory: classifyDiagnosticError(raw),
      termuxExternalApps: deniedExternalApps ? "blocked" : "not-observed",
    });
    if (permissionDenied) {
      runCommandPermissionGate.remember(false);
      deepReadinessProbeCache = null;
      reasons.push("run_command_permission_missing");
      probeDetail = runCommandPermissionStatus(raw).slice(0, 360);
    } else {
      reasons.push("run_command_probe_failed");
      probeDetail = `RUN_COMMAND probe could not complete: ${raw}`.slice(0, 240);
    }
  }

  const ready = reasons.length === 0;
  persistentLogger.trace({ ...traceBase, step: "readiness.result", status: ready ? "succeeded" : "blocked", resultCode: ready ? "ready" : "unknown", ...(!ready && reasons.some((reason) => reason.includes("permission")) ? { errorCategory: "permission-denied" as const } : {}) });
  return {
    ready,
    reasons,
    probed: true,
    probeDetail,
  };
}


// RUN_COMMAND is special/package-scoped and cannot be granted through the
// ordinary runtime-permission API. Only open app details after an explicit tap;
// a later readiness check must read the actual OS grant before dispatching.
export async function openRunCommandPermissionSettings(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  runCommandPermissionGate.invalidate();
  deepReadinessProbeCache = null;
  try {
    await Linking.openSettings();
    return true;
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
const BUILD_TIMEOUT_MS = 9_300_000;   // v389: 155 минут — самолечащийся build-скрипт делает до 10 попыток + докачку SDK внутри одной команды
const MAX_COMMAND_TIMEOUT_MS = 10_800_000; // v389: hard cap 3 h (autobuild wall budget is 150 min)

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

/**
 * Commands longer than this are written to $HOME and executed via bash path.
 * Rootfs probes sit just under 1200 chars; on-device direct RUN_COMMAND still
 * drops trailing AIB_*_END markers (~87–103 B callbacks). Always stage those.
 */
const LONG_COMMAND_THRESHOLD = 1200;
const LONG_CMD_SCRIPT = "$HOME/aibuilder-scripts/aib-long-cmd.sh";

/** Force file staging so multi-marker proot probes and long installs keep full stdout. */
function shouldStageCommandViaFile(command: string, commandKind: string): boolean {
  if (command.length > LONG_COMMAND_THRESHOLD) return true;
  if (command.length > 800 && command.includes("\n")) return true;
  if (commandKind === "rootfs-probe" || commandKind === "rootfs-install") return true;
  // Package-menu rootfs check embeds the probe; identity markers alone are not a full envelope.
  if (command.includes("AIB_PROBE_BEGIN") || command.includes("AIB_LOGIN_BEGIN")) return true;
  if (/\bproot-distro\s+login\b/.test(command) && command.length > 400) return true;
  return false;
}

async function runLongCommandViaFile(
  command: string,
  native: NonNullable<ReturnType<typeof getNative>>,
  timeout: number,
  workdir: string | null,
  commandId: string,
  backendLabel?: string,
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
  const prep = await invokeNativeRunCommand(
    native,
    `mkdir -p "$HOME/aibuilder-scripts" && : > "${scriptPath}" && echo PREP_OK`,
    null,
    15_000,
    backendLabel || "Termux",
    `${commandId}-prep`,
  );
  if (prep.exitCode !== 0 && !(prep.stdout || "").includes("PREP_OK")) {
    persistentLogger.add("warn", "TermuxBridge", `long-cmd prep failed ${summarizeCommandOutputForLogs(command, prep.stderr || prep.stdout)}`);
    // fall through to direct execution
    return invokeNativeRunCommand(native, command, workdir, timeout, backendLabel || "Termux", commandId);
  }
  for (let i = 0; i < b64.length; i += chunkSize) {
    const c = b64.slice(i, i + chunkSize);
    const r = await invokeNativeRunCommand(
      native,
      `printf '%s' '${c}' | base64 -d >> "${scriptPath}"`,
      null,
      15_000,
      backendLabel || "Termux",
      `${commandId}-chunk-${i}`,
    );
    if (r.exitCode !== 0) {
      persistentLogger.add("error", "TermuxBridge", `long-cmd chunk fail at ${i}`);
      return invokeNativeRunCommand(native, command, workdir, timeout, backendLabel || "Termux", commandId);
    }
  }
  await invokeNativeRunCommand(
    native,
    `chmod +x "${scriptPath}" 2>/dev/null || true`,
    null,
    10_000,
    backendLabel || "Termux",
    `${commandId}-chmod`,
  );
  // Построчный stdout — иначе heartbeat «stdout 0 байт» при живом Gradle
  // Cleanup script after run (best-effort) to avoid filling $HOME
  const launch =
    `if command -v stdbuf >/dev/null 2>&1; then stdbuf -oL -eL bash "${scriptPath}"; ` +
    `else bash "${scriptPath}"; fi; EC=$?; rm -f "${scriptPath}" 2>/dev/null || true; exit $EC`;
  persistentLogger.add("info", "TermuxBridge", `long-cmd via file id=${commandId} commandChars=${command.length} workdir=default`);
  return invokeNativeRunCommand(native, launch, workdir, timeout, backendLabel || "Termux", commandId);
}

async function runShellCommandNow(
  command: string,
  opts?: { workdir?: string; timeoutMs?: number; isBuild?: boolean; honorExplicitTimeout?: boolean; traceId?: string; backend?: AgentShellBackend }
): Promise<TermuxCommandResult> {
  const t0 = Date.now();
  const commandId = `js-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const traceId = opts?.traceId || commandId;
  const backend = opts?.backend ?? getBuildBackend();
  const label = backendLabel(backend);
  const commandKind = classifyCommandForDiagnostics(command);
  const target = backend === "ubuntu-proot" ? "ubuntu" : "termux";
  const screen = commandKind === "rootfs-probe" || commandKind === "rootfs-install" ? "runtime"
    : commandKind === "build-tool" ? "build" : commandKind === "git" ? "github" : "termux";
  const traceBase = { correlationId: traceId, commandId, action: `command.${commandKind}`, backend, target, screen } as const;
  persistentLogger.trace({ ...traceBase, step: "android.run-command-permission-check", status: "started", androidRunCommand: "unknown", termuxExternalApps: "not-observed" });
  const native = getNative();
  if (!native) {
    persistentLogger.trace({ ...traceBase, step: "native-module-check", status: "failed", errorCategory: "native-module-missing", resultCode: "unavailable" });
    persistentLogger.add("error", "TermuxBridge", "TERMUX_NATIVE_MODULE_MISSING");
    throw new Error("TERMUX_NATIVE_MODULE_MISSING");
  }

  // Check package-scoped permission before Android attempts to start Termux's
  // RUN_COMMAND service. Cache denials briefly to stop callback floods; this
  // does not grant or bypass the permission.
  let permissionGranted = false;
  try {
    permissionGranted = await readRunCommandPermission(native);
  } catch (error) {
    persistentLogger.trace({ ...traceBase, step: "android.run-command-permission-check", status: "blocked", errorCategory: classifyDiagnosticError(error), androidRunCommand: "unknown", termuxExternalApps: "not-observed", durationMs: Date.now() - t0 });
    const now = Date.now();
    if (now - lastPermissionGateWarningAt > 30_000) {
      lastPermissionGateWarningAt = now;
      persistentLogger.add("warn", "TermuxPermission", runCommandPermissionStatus(error instanceof Error ? error.message : error));
    }
    throw new Error(runCommandPermissionStatus(error instanceof Error ? error.message : error));
  }
  // v407: do not flood the log with one "blocked" trace per command while RUN_COMMAND is missing.
  if (permissionGranted || Date.now() - lastPermissionBlockedTraceAt > 30_000) {
    if (!permissionGranted) lastPermissionBlockedTraceAt = Date.now();
    persistentLogger.trace({ ...traceBase, step: "android.run-command-permission-check", status: permissionGranted ? "succeeded" : "blocked", androidRunCommand: permissionGranted ? "granted" : "missing", termuxExternalApps: "not-observed", durationMs: Date.now() - t0, ...(!permissionGranted ? { errorCategory: "permission-denied" as const } : {}) });
  }
  if (!permissionGranted) {
    const now = Date.now();
    if (now - lastPermissionGateWarningAt > 30_000) {
      lastPermissionGateWarningAt = now;
      persistentLogger.add("warn", "TermuxPermission", runCommandPermissionStatus("RUN_COMMAND_PERMISSION_MISSING"));
    }
    throw new Error(runCommandPermissionStatus("RUN_COMMAND_PERMISSION_MISSING"));
  }

  const cmd = String(command || "").trim();
  if (!cmd) {
    throw new Error("TERMUX_EMPTY_COMMAND");
  }
  // Soft workdir allowlist (null/empty = Termux default HOME)
  if (opts?.workdir) {
    const wd = String(opts.workdir);
    if (wd.includes("\0") || wd.includes("..") || (wd.startsWith("/") && !/^(\/data\/data\/com\.termux|\/storage\/|\/sdcard\/)/.test(wd))) {
      throw new Error("TERMUX_WORKDIR_NOT_ALLOWED");
    }
  }

  // Автоматическое определение таймаута по типу команды
  let timeout = opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (opts?.honorExplicitTimeout !== true && (opts?.isBuild === true || looksLikeLongRunningCommand(cmd))) {
    timeout = Math.max(timeout, BUILD_TIMEOUT_MS);
  }
  // Preserve explicit long-operation budgets (for example proot-distro rootfs
  // bootstrap) while retaining a finite cap against accidental unbounded waits.
  timeout = Math.min(Math.max(1_000, timeout), MAX_COMMAND_TIMEOUT_MS);

  const safeCommand = redactCommandForLogs(command);
  // Persistent diagnostics keep IDs/categories, not shell commands or private paths.
  persistentLogger.add(
    "info",
    backend === "termux" ? "Termux" : `Linux:${label}:command`,
    `commandKind=${commandKind} id=${commandId} traceId=${traceId} chars=${command.length}`,
    backend === "termux" ? "termux" : "agent"
  );
  // Plain-language progress so the user is not left staring at a silent chat
  // while a multi-minute rootfs download/unpack runs.
  if (commandKind === "rootfs-install") {
    const distroHint = /ubuntu/i.test(label) || /ubuntu/i.test(command)
      ? "Ubuntu"
      : /debian/i.test(label) || /debian/i.test(command)
        ? "Debian"
        : "Linux";
    const minutes = Math.max(1, Math.round(timeout / 60_000));
    persistentLogger.add(
      "info",
      "Runtime",
      `Начата установка ${distroHint} rootfs (до ~${minutes} мин). Не закрывайте приложение; прогресс идёт в фоне. Это не создание обычного файла.`,
      "app",
    );
  } else if (commandKind === "rootfs-probe") {
    persistentLogger.add(
      "info",
      "Runtime",
      `Проверка ${label || backend} rootfs/login…`,
      "app",
    );
  }
  commandContexts.set(commandId, { backend, label, startedAt: t0, command });
  const workdirLabel = opts?.workdir ? "(custom)" : "(default)";

  persistentLogger.add(
    "debug",
    backend === "termux" ? "TermuxBridge" : `Linux:${label}:bridge`,
    `→ start id=${commandId} traceId=${traceId} backend=${backend} commandKind=${commandKind} timeout=${timeout}ms workdir=${workdirLabel}`
  );
  persistentLogger.trace({ ...traceBase, step: "bridge.command-dispatch", status: "started", timeoutMs: timeout, termuxExternalApps: "not-observed" });
  if (backend !== "termux") {
    persistentLogger.add(
      "info",
      `Linux:${label}:command`,
      `guest command id=${commandId} traceId=${traceId} commandKind=${commandKind} cwd=${workdirLabel}`,
      "agent"
    );
  }

  // Terminal-style prompt: full command, no truncation.
  emitJsConsoleEvent({
    stream: "lifecycle",
    event: "dispatch",
    chunk: formatConsolePrompt(safeCommand),
    cmdId: commandId,
  });

  retainTermuxStream();
  try {
    // Stage rootfs probes and long/multi-line installs via file so framed
    // AIB_* markers are not truncated by the direct RUN_COMMAND binder path.
    const useFile = shouldStageCommandViaFile(command, commandKind);
    const result = useFile
      ? await runLongCommandViaFile(command, native, timeout, opts?.workdir || null, commandId, label)
      : await invokeNativeRunCommand(
          native,
          command,
          opts?.workdir || null,
          timeout,
          label,
          commandId,
        );
    // The native callback is authoritative. Keep full output transient for the
    // caller/console, while persistent diagnostics retain only allowlisted markers.
    const stdout = redactCommandOutputForLogs(command, String(result.stdout || ""));
    const stderr = redactCommandOutputForLogs(command, String(result.stderr || ""));
    if (stdout) {
      persistentLogger.add("info", backend === "termux" ? `Termux:${commandId}:stdout` : `Linux:${label}:${commandId}:stdout`, summarizeCommandOutputForLogs(command, stdout), backend === "termux" ? "termux" : "agent");
    } else {
      persistentLogger.add("info", backend === "termux" ? `Termux:${commandId}:stdout` : `Linux:${label}:${commandId}:stdout`, "[OUTPUT_EMPTY]", backend === "termux" ? "termux" : "agent");
    }
    if (stderr) {
      persistentLogger.add("warn", backend === "termux" ? `Termux:${commandId}:stderr` : `Linux:${label}:${commandId}:stderr`, summarizeCommandOutputForLogs(command, stderr), backend === "termux" ? "termux" : "agent");
    }
    flushCommandStream(commandId, true);
    persistCommandStreamSummary(commandId);

    // Authoritative final mirror into console UI (covers missing live am-broadcast).
    // Use a distinct lifecycle marker so ConsoleContext can flush buffers first.
    // Flush lifecycle "finished" silently — console only shows real stdout/stderr.
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "finished",
      chunk: "",
      cmdId: commandId,
    });
    if (stdout) {
      emitJsConsoleEvent({
        stream: "stdout",
        chunk: stdout.endsWith("\n") ? stdout : stdout + "\n",
        cmdId: commandId,
      });
    }
    if (stderr) {
      emitJsConsoleEvent({
        stream: "stderr",
        chunk: stderr.endsWith("\n") ? stderr : stderr + "\n",
        cmdId: commandId,
      });
    }
    // Always show exit status like a real shell (full visibility).
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "exit",
      chunk: result.timedOut
        ? `exit ${result.exitCode} (timeout)`
        : `exit ${result.exitCode}`,
      cmdId: commandId,
    });

    const ms = Date.now() - t0;
    // exit>=1 + empty stdout/stderr is normal for probes like `command -v missing`
    // (shell returns 1 with no text). Only treat as channel failure when exitCode < 0
    // (service/start failure) or when a successful command produced zero bytes unexpectedly.
    // exit>=1 + empty stdout/stderr is normal for probes (e.g. `command -v missing`).
    // exit==0 + empty output is also normal (true, mkdir -p, etc.).
    // Only exitCode < 0 indicates service/start/channel failure.
    const channelFailure =
      !result.timedOut &&
      stdout.length === 0 &&
      stderr.length === 0 &&
      result.exitCode < 0;
    persistentLogger.trace({
      ...traceBase,
      step: "bridge.command-result",
      nativeCommandId: result.nativeCommandId,
      status: result.timedOut ? "timed_out" : result.exitCode === 0 ? "succeeded" : "failed",
      durationMs: ms,
      timeoutMs: timeout,
      exitCode: result.exitCode,
      stdoutBytes: utf8ByteLength(stdout),
      stderrBytes: utf8ByteLength(stderr),
      stdoutChars: stdout.length,
      stderrChars: stderr.length,
      outputMetricSource: "normalized-callback-redacted",
      resultCode: result.outputTruncated ? "truncated" : stdout.length === 0 && stderr.length === 0 ? "empty" : "valid",
      ...(result.timedOut ? { errorCategory: "timeout" as const } : result.outputTruncated ? { errorCategory: "output-truncated" as const } : result.exitCode !== 0 ? { errorCategory: "command-failed" as const } : {}),
      termuxExternalApps: "not-observed",
    });
    if (channelFailure) {
      persistentLogger.add(
        "error",
        backend === "termux" ? "Termux" : `Linux:${label}:result`,
        `TERMUX_NO_OUTPUT id=${commandId} backend=${backend} commandKind=${commandKind} exit=${result.exitCode} (${ms}ms) commandChars=${command.length}`,
        backend === "termux" ? "termux" : "agent"
      );
    }
    persistentLogger.add(
      result.exitCode === 0 && !result.timedOut ? "info" : "warn",
      backend === "termux" ? "Termux" : `Linux:${label}:result`,
      `← end id=${commandId} traceId=${traceId} backend=${backend} exit=${result.exitCode}` +
        (result.timedOut ? " TIMEOUT" : "") +
        (channelFailure ? " TERMUX_NO_OUTPUT" : "") +
        ` (${ms}ms, out=${utf8ByteLength(stdout)}B/${stdout.length}chars err=${utf8ByteLength(stderr)}B/${stderr.length}chars, cmdLen=${command.length})`,
      backend === "termux" ? "termux" : "agent"
    );
    commandContexts.delete(commandId);
    commandStreamBuffers.delete(commandId);
    return {
      ...result,
      commandId,
      stdout,
      // Do not rewrite stderr for normal non-zero exits (package probes, etc.).
      stderr: channelFailure
        ? `TERMUX_NO_OUTPUT: exit=${result.exitCode}, empty stdout/stderr, cmdLen=${command.length}. ` +
          `Канал Termux не вернул вывод (сервис не стартовал / лимит длины команды / ранняя ошибка).`
        : stderr,
    };
  } catch (e: unknown) {
    flushCommandStream(commandId, true);
    persistCommandStreamSummary(commandId);
    const ms = Date.now() - t0;
    const msg = redactCommandOutputForLogs(command, e instanceof Error ? e.message : String(e));
    if (isAndroidRunCommandPermissionDenied(msg)) {
      runCommandPermissionGate.remember(false);
      deepReadinessProbeCache = null;
      const now = Date.now();
      if (now - lastPermissionGateWarningAt > 30_000) {
        lastPermissionGateWarningAt = now;
        persistentLogger.add("warn", "TermuxPermission", runCommandPermissionStatus(msg));
      }
    }
    emitJsConsoleEvent({
      stream: "lifecycle",
      event: "exception",
      chunk: msg,
      cmdId: commandId,
    });
    // Warn only on an explicit app-scoped Android denial or an explicit Termux false value.
    const isSetup = isAndroidRunCommandPermissionDenied(msg) || isExplicitTermuxExternalAppsFalse(msg);
    persistentLogger.add(
      isSetup ? "warn" : "error",
      backend === "termux" ? "Termux" : `Linux:${label}:result`,
      `← exception id=${commandId} traceId=${traceId} backend=${backend} ${ms}ms errorCategory=${classifyDiagnosticError(msg)}`,
      backend === "termux" ? "termux" : "agent"
    );
    persistentLogger.trace({
      ...traceBase,
      step: "bridge.command-result",
      status: isSetup ? "blocked" : /timeout|timed\s*out/i.test(msg) ? "timed_out" : /cancel|abort/i.test(msg) ? "cancelled" : "failed",
      durationMs: ms,
      timeoutMs: timeout,
      errorCategory: classifyDiagnosticError(msg),
      resultCode: "unavailable",
      termuxExternalApps: isExplicitTermuxExternalAppsFalse(msg) ? "blocked" : "not-observed",
    });
    commandContexts.delete(commandId);
    commandStreamBuffers.delete(commandId);
    throw e;
  } finally {
    commandContexts.delete(commandId);
    commandStreamBuffers.delete(commandId);
    releaseTermuxStream();
  }
}


/**
 * User pressed Stop: unblock all native RUN_COMMAND waiters and drop queued jobs.
 * Termux host and Ubuntu/Debian proot share this bridge.
 */
export async function cancelAllRunningTermuxCommands(): Promise<{ cancelledWaiters: number; clearedQueue: number }> {
  const clearedQueue = clearPendingTermuxQueue("ABORTED");
  let cancelledWaiters = 0;
  try {
    const native = getNative() as null | { cancelAllCommands?: () => Promise<number> };
    if (native && typeof native.cancelAllCommands === "function") {
      const n = await native.cancelAllCommands();
      cancelledWaiters = typeof n === "number" ? n : Number(n) || 0;
    }
  } catch (e: unknown) {
    persistentLogger.add(
      "warn",
      "TermuxBridge",
      `cancelAllCommands failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  persistentLogger.add(
    "warn",
    "TermuxBridge",
    `Stop: cancelledWaiters=${cancelledWaiters} clearedQueue=${clearedQueue}`,
  );
  return { cancelledWaiters, clearedQueue };
}

export function runShellCommand(
  command: string,
  opts?: {
    workdir?: string;
    timeoutMs?: number;
    isBuild?: boolean;
    /** Keep a caller-supplied finite phase budget instead of the generic long-command floor. */
    honorExplicitTimeout?: boolean;
    /** high = interactive Termux panel; runs before pending agent/script jobs */
    priority?: TermuxQueuePriority;
    traceId?: string;
    /** Explicit host or guest label paired with the router's execution target. */
    backend?: AgentShellBackend;
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
  if (isAndroidRunCommandPermissionDenied(raw)) {
    return { code: "permission", hintKey: "termuxReasonPermissionMissing" };
  }
  if (isExplicitTermuxExternalAppsFalse(raw)) {
    return { code: "allow_external", hintKey: "termuxReasonExternalAppsDisabled" };
  }
  if (m.includes("not_android") || m.includes("termux_native_module_missing")) {
    return { code: "not_installed", hintKey: "packTermuxNotReady" };
  }
  if (m.includes("securityexception")) {
    return { code: "service", hintKey: "termuxReasonUnknown" };
  }
  if (m.includes("permission denial") || m.includes("permission denied")) {
    return { code: "unknown", hintKey: "termuxReasonUnknown" };
  }
  if (
    m.includes("unable to start service") ||
    m.includes("run_command") ||
    m.includes("illegalstateexception")
  ) {
    return { code: "service", hintKey: "termuxReasonUnknown" };
  }
  if (m.includes("permission")) {
    return { code: "unknown", hintKey: "termuxReasonUnknown" };
  }
  if (m.includes("timeout") || m.includes("timed out")) {
    return { code: "timeout", hintKey: "termuxReasonUnknown" };
  }
  return { code: "unknown", hintKey: "termuxReasonUnknown" };
}
