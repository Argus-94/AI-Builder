/**
 * AgentTrace — structured record of a Termux-agent run (Tracely-inspired, on-device).
 * - Append steps (command / tool / decision / done)
 * - Structural gates on TERMUX_DONE (no LLM)
 * - Failure cluster → repair recipe id
 * - Persist last N traces under AsyncStorage for replay / regression
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistentLogger } from "./persistent-logger";

export type TraceStepKind = "plan" | "command" | "tool" | "decision" | "gate" | "done" | "error";

export type AgentTraceStep = {
  id: string;
  at: number;
  kind: TraceStepKind;
  summary: string;
  command?: string;
  exitCode?: number;
  stdoutPreview?: string;
  stderrPreview?: string;
  ok?: boolean;
  meta?: Record<string, string | number | boolean | null>;
};

export type StructuralGateResult = {
  id: string;
  pass: boolean;
  detail: string;
};

export type AgentTrace = {
  id: string;
  sessionId?: string;
  task: string;
  startedAt: number;
  endedAt?: number;
  status: "running" | "pass" | "fail" | "abort";
  steps: AgentTraceStep[];
  gates?: StructuralGateResult[];
  apkPath?: string | null;
  failureCluster?: string | null;
  recipeId?: string | null;
};

const TRACE_INDEX_KEY = "aibuilder.agentTrace.index.v1";
const TRACE_PREFIX = "aibuilder.agentTrace.v1.";
const MAX_TRACES = 20;
const PREVIEW = 400;

function uid(): string {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function preview(s: string | undefined, n = PREVIEW): string {
  if (!s) return "";
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function createAgentTrace(task: string, sessionId?: string): AgentTrace {
  return {
    id: uid(),
    sessionId,
    task: (task || "").slice(0, 2000),
    startedAt: Date.now(),
    status: "running",
    steps: [],
  };
}

export function appendTraceStep(
  trace: AgentTrace,
  step: Omit<AgentTraceStep, "id" | "at"> & { id?: string; at?: number },
): AgentTrace {
  const full: AgentTraceStep = {
    id: step.id || uid(),
    at: step.at || Date.now(),
    kind: step.kind,
    summary: step.summary.slice(0, 500),
    command: step.command?.slice(0, 2000),
    exitCode: step.exitCode,
    stdoutPreview: preview(step.stdoutPreview),
    stderrPreview: preview(step.stderrPreview),
    ok: step.ok,
    meta: step.meta,
  };
  trace.steps.push(full);
  // Cap in-memory size
  if (trace.steps.length > 200) {
    trace.steps = trace.steps.slice(-200);
  }
  return trace;
}

/** Absolute path to a concrete .apk file. */
export function extractApkPath(text: string): string | null {
  const m =
    text.match(/(?:^|[\s"'`=])(\/(?:storage|data|sdcard)\/[^\s"'`<>]+\.(?:apk|aab))\b/i) ||
    text.match(/(?:^|[\s"'`=])(\$HOME\/[^\s"'`<>]+\.(?:apk|aab))\b/i) ||
    text.match(/AIB_DETERMINISTIC_APK=(\/[^\s]+)/i) ||
    text.match(/APK_PATH=(\/[^\s]+\.(?:apk|aab))/i) ||
    text.match(/AAB_OK=(\/[^\s]+\.aab)/i);
  return m?.[1]?.trim() || null;
}

/**
 * Structural gates for a candidate TERMUX_DONE message (build / create-app tasks).
 * Pure functions — no network, no model.
 */
export function runStructuralGates(
  task: string,
  doneMessage: string,
  opts?: { requireApk?: boolean },
): StructuralGateResult[] {
  const msg = (doneMessage || "").trim();
  const requireApk =
    opts?.requireApk ??
    /\b(apk|aab|bundle|assemble|gradlew|созда[йи].*(приложен|apk|hello)|hello\s*world|build\s*apk)\b/i.test(
      task || "",
    );

  const gates: StructuralGateResult[] = [];

  // G1: no "open Packages menu" as success
  const packagesPush =
    /(меню\s*[«"]?Пакеты|Packages\s*menu|Для компиляции|откройте\s+Пакеты)/i.test(msg) &&
    !extractApkPath(msg);
  gates.push({
    id: "no_packages_menu_done",
    pass: !packagesPush,
    detail: packagesPush
      ? "DONE tells user to open Packages instead of installing/building"
      : "ok",
  });

  // G2: no relative-only success
  const relativeOnly =
    /(сборк[аеи]\s+успешн|build\s+success|BUILD SUCCESSFUL|проверьте\s+app\/build)/i.test(msg) &&
    !extractApkPath(msg);
  gates.push({
    id: "no_relative_apk_hint",
    pass: !relativeOnly,
    detail: relativeOnly
      ? "Success claimed without absolute .apk/.aab path"
      : "ok",
  });

  // G3: absolute apk path when required
  const apk = extractApkPath(msg);
  if (requireApk) {
    gates.push({
      id: "absolute_apk_path",
      pass: !!apk,
      detail: apk ? `path=${apk}` : "no absolute *.apk/*.aab path in DONE",
    });
  }

  // G4: path looks like real device location
  if (apk) {
    const onDevice =
      /^\/storage\/emulated\/0\//i.test(apk) ||
      /^\/data\/data\/com\.termux\//i.test(apk) ||
      /^\/sdcard\//i.test(apk) ||
      /^\$HOME\//i.test(apk) ||
      /^\/data\/data\/com\.termux\/files\/home\//i.test(apk);
    gates.push({
      id: "apk_on_device_path",
      pass: onDevice,
      detail: onDevice ? "ok" : `unusual path: ${apk}`,
    });
  }

  // G5: no protocol echo
  const protocolEcho =
    /Обычный чат|РЕЖИМЫ ОТВЕТА|TERMUX_RUN:\/TERMUX_DONE:/i.test(msg) && msg.length > 200;
  gates.push({
    id: "no_protocol_echo",
    pass: !protocolEcho,
    detail: protocolEcho ? "DONE looks like system prompt echo" : "ok",
  });

  return gates;
}

export function gatesPassed(gates: StructuralGateResult[]): boolean {
  return gates.every((g) => g.pass);
}

/** Map log / DONE text → failure cluster id + optional repair recipe. */
export function clusterFailure(blob: string): { cluster: string; recipeId: string | null } {
  const t = (blob || "").toLowerCase();
  if (/no_wrapper_jar|no_verified_gradle_wrapper|gradle_wrapper_properties_missing|gradle-wrapper\.jar|gradlewrappermain|could not find or load main class/i.test(t)) {
    return { cluster: "missing_gradle_wrapper", recipeId: "gradle-wrapper" };
  }
  if (/aapt2=missing|aapt2.*not found|aapt2.*permission denied|permission denied.*aapt2|error:.*aapt/i.test(t)) {
    return { cluster: "missing_aapt2", recipeId: "aapt2-sdk" };
  }
  if (/java=missing|unsupported class file major version|invalid source release/i.test(t)) {
    return { cluster: "java_broken", recipeId: "java-install" };
  }
  if (/expo_cli_missing|node_modules_install_failed|expo_prebuild_failed|no_node\b/i.test(t)) {
    return { cluster: "expo_or_node_missing", recipeId: "nodejs" };
  }
  if (/sdk location not found|sdk_platforms=missing|android_home|license not accepted/i.test(t)) {
    return { cluster: "sdk_missing", recipeId: "local-properties" };
  }
  if (/gradle=broken|gradle=missing|could not create an instance of type/i.test(t)) {
    return { cluster: "gradle_broken", recipeId: "gradle-pkg" };
  }
  if (/packages\s*menu|меню\s*пакеты|для компиляции/i.test(t) && !extractApkPath(t)) {
    return { cluster: "gave_up_to_packages_menu", recipeId: "aapt2-sdk" };
  }
  if (/no apk after assemble|apk не найден|aab не найден|no_apk_output|premature_done|no absolute path/i.test(t)) {
    return { cluster: "apk_not_produced", recipeId: null };
  }
  if (/termux_no_output|securityexception|allow-external-apps|run_command/i.test(t)) {
    return { cluster: "termux_channel", recipeId: null };
  }
  if (/connection (refused|reset)|could not resolve|failed to download|unknown host/i.test(t)) {
    return { cluster: "network_deps", recipeId: "wget-curl" };
  }
  return { cluster: "unknown", recipeId: null };
}

export function finalizeTrace(
  trace: AgentTrace,
  status: AgentTrace["status"],
  doneMessage?: string,
  opts?: { requireApk?: boolean },
): AgentTrace {
  trace.endedAt = Date.now();
  trace.status = status;
  if (doneMessage) {
    const apk = extractApkPath(doneMessage);
    if (apk) trace.apkPath = apk;
    const gates = runStructuralGates(trace.task, doneMessage, opts);
    trace.gates = gates;
    if (status === "pass" && !gatesPassed(gates)) {
      trace.status = "fail";
    }
    if (trace.status === "fail") {
      const c = clusterFailure(doneMessage + "\n" + trace.steps.map((s) => s.stderrPreview || s.summary).join("\n"));
      trace.failureCluster = c.cluster;
      trace.recipeId = c.recipeId;
    }
  }
  return trace;
}

export async function persistAgentTrace(trace: AgentTrace): Promise<void> {
  try {
    const key = TRACE_PREFIX + trace.id;
    await AsyncStorage.setItem(key, JSON.stringify(trace));
    let index: string[] = [];
    try {
      const raw = await AsyncStorage.getItem(TRACE_INDEX_KEY);
      if (raw) index = JSON.parse(raw) as string[];
    } catch {
      index = [];
    }
    index = [trace.id, ...index.filter((id) => id !== trace.id)].slice(0, MAX_TRACES);
    await AsyncStorage.setItem(TRACE_INDEX_KEY, JSON.stringify(index));
    // Drop old
    if (index.length === MAX_TRACES) {
      /* best-effort: do not scan all keys */
    }
    persistentLogger.add(
      "info",
      "AgentTrace",
      `saved ${trace.id} status=${trace.status} steps=${trace.steps.length} cluster=${trace.failureCluster || "-"}`,
    );
  } catch (e) {
    persistentLogger.add(
      "warn",
      "AgentTrace",
      `persist failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

export async function loadRecentTraces(limit = 10): Promise<AgentTrace[]> {
  try {
    const raw = await AsyncStorage.getItem(TRACE_INDEX_KEY);
    const index: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    const out: AgentTrace[] = [];
    for (const id of index.slice(0, limit)) {
      const body = await AsyncStorage.getItem(TRACE_PREFIX + id);
      if (body) {
        try {
          out.push(JSON.parse(body) as AgentTrace);
        } catch {
          /* skip */
        }
      }
    }
    return out;
  } catch {
    return [];
  }
}

/** Compact one-line summary for UI / logs. */
export function formatTraceSummary(trace: AgentTrace): string {
  const sec = trace.endedAt
    ? Math.round((trace.endedAt - trace.startedAt) / 1000)
    : Math.round((Date.now() - trace.startedAt) / 1000);
  const gates = trace.gates ? `${trace.gates.filter((g) => g.pass).length}/${trace.gates.length} gates` : "";
  return `[trace ${trace.status}] ${trace.steps.length} steps · ${sec}s${gates ? " · " + gates : ""}${
    trace.apkPath ? " · " + trace.apkPath : ""
  }${trace.failureCluster ? " · cluster=" + trace.failureCluster : ""}`;
}

/**
 * Built-in hermetic fixture scenarios (no live model).
 * Used by selftests / regression: expected agent routing behavior.
 */
export type TraceFixture = {
  id: string;
  task: string;
  expectAgent: boolean;
  expectApkGate: boolean;
  sampleDonePass?: string;
  sampleDoneFail?: string;
};

export const BUILTIN_TRACE_FIXTURES: TraceFixture[] = [
  {
    id: "chat_capabilities",
    task: "Напиши полный список что умеешь делать",
    expectAgent: false,
    expectApkGate: false,
  },
  {
    id: "create_hello_world",
    task: "Создай Hello World",
    expectAgent: true,
    expectApkGate: true,
    sampleDonePass:
      "APK готов: /storage/emulated/0/AIBuilderTermux/HelloWorld/app/build/outputs/apk/debug/app-debug.apk",
    sampleDoneFail: "Сборка успешна. Проверьте app/build/outputs/apk/.",
  },
  {
    id: "move_apk_download",
    task: "Перемести его сюда; /storage/emulated/0/Download/",
    expectAgent: true,
    expectApkGate: false,
  },
  {
    id: "path_question",
    task: "А напиши путь куда сохранился apk",
    expectAgent: false,
    expectApkGate: false,
  },
  {
    id: "packages_menu_fail",
    task: "Создай Hello World",
    expectAgent: true,
    expectApkGate: true,
    sampleDoneFail:
      'APK не собран. Установите Android SDK через меню "Пакеты → Для компиляции".',
  },
];

/** Run structural gates against fixtures (sync unit check). */
export function runFixtureGateSelftest(): { ok: boolean; report: string } {
  const lines: string[] = [];
  let ok = true;
  for (const f of BUILTIN_TRACE_FIXTURES) {
    if (f.sampleDonePass) {
      const g = runStructuralGates(f.task, f.sampleDonePass, { requireApk: f.expectApkGate });
      const pass = gatesPassed(g);
      if (!pass) {
        ok = false;
        lines.push(`FAIL ${f.id} sampleDonePass should pass: ${g.filter((x) => !x.pass).map((x) => x.id).join(",")}`);
      } else {
        lines.push(`OK ${f.id} sampleDonePass`);
      }
    }
    if (f.sampleDoneFail) {
      const g = runStructuralGates(f.task, f.sampleDoneFail, { requireApk: f.expectApkGate });
      const pass = gatesPassed(g);
      if (pass && f.expectApkGate) {
        ok = false;
        lines.push(`FAIL ${f.id} sampleDoneFail should fail gates`);
      } else {
        lines.push(`OK ${f.id} sampleDoneFail rejected`);
      }
    }
  }
  return { ok, report: lines.join("\n") };
}


/** Text dump of recent traces for log export / share. */
export async function exportTracesAsText(limit = 12): Promise<string> {
  const traces = await loadRecentTraces(limit);
  if (!traces.length) return "=== Agent Traces ===\n(none)\n";
  const blocks: string[] = ["=== Agent Traces ===", `count=${traces.length}`];
  for (const tr of traces) {
    blocks.push("");
    blocks.push(`--- trace ${tr.id} ---`);
    blocks.push(formatTraceSummary(tr));
    blocks.push(`task: ${tr.task}`);
    if (tr.failureCluster) blocks.push(`cluster: ${tr.failureCluster} recipe=${tr.recipeId || "-"}`);
    if (tr.apkPath) blocks.push(`apk: ${tr.apkPath}`);
    if (tr.gates?.length) {
      for (const g of tr.gates) {
        blocks.push(`  gate ${g.pass ? "PASS" : "FAIL"} ${g.id}: ${g.detail}`);
      }
    }
    for (const s of tr.steps.slice(-60)) {
      blocks.push(
        `  [${s.kind}] ${s.ok === false ? "FAIL " : ""}${s.summary}` +
          (s.exitCode !== undefined ? ` exit=${s.exitCode}` : ""),
      );
      if (s.command) blocks.push(`    $ ${s.command.slice(0, 300)}`);
    }
  }
  return blocks.join("\n") + "\n";
}


// ── Promoted regression fixtures (user-saved from failed traces) ───────────

const PROMOTED_KEY = "aibuilder.agentTrace.promoted.v1";
const MAX_PROMOTED = 30;

export type PromotedFixture = {
  id: string;
  sourceTraceId: string;
  task: string;
  cluster: string | null;
  recipeId: string | null;
  sampleDoneFail: string;
  /** Optional known-good DONE text for fail-to-pass checks */
  sampleDonePass?: string;
  createdAt: number;
  note?: string;
};

export async function loadPromotedFixtures(): Promise<PromotedFixture[]> {
  try {
    const raw = await AsyncStorage.getItem(PROMOTED_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as PromotedFixture[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export async function promoteTraceToFixture(
  trace: AgentTrace,
  opts?: { note?: string; sampleDonePass?: string },
): Promise<PromotedFixture> {
  const failText =
    trace.steps
      .filter((s) => s.kind === "done" || s.kind === "error" || s.kind === "gate")
      .map((s) => s.summary)
      .join("\n") ||
    `status=${trace.status} cluster=${trace.failureCluster || "unknown"}`;

  const fixture: PromotedFixture = {
    id: uid(),
    sourceTraceId: trace.id,
    task: (trace.task || "").slice(0, 500),
    cluster: trace.failureCluster || null,
    recipeId: trace.recipeId || null,
    sampleDoneFail: failText.slice(0, 2000),
    sampleDonePass: opts?.sampleDonePass,
    createdAt: Date.now(),
    note: opts?.note,
  };

  const list = await loadPromotedFixtures();
  const next = [fixture, ...list.filter((f) => f.sourceTraceId !== trace.id)].slice(0, MAX_PROMOTED);
  await AsyncStorage.setItem(PROMOTED_KEY, JSON.stringify(next));
  persistentLogger.add(
    "info",
    "AgentTrace",
    `promoted fixture ${fixture.id} from ${trace.id} cluster=${fixture.cluster || "-"}`,
  );
  return fixture;
}

export async function removePromotedFixture(id: string): Promise<void> {
  const list = await loadPromotedFixtures();
  await AsyncStorage.setItem(
    PROMOTED_KEY,
    JSON.stringify(list.filter((f) => f.id !== id)),
  );
}

/**
 * Fail-to-pass contract: sampleDoneFail must FAIL gates; sampleDonePass (if any) must PASS.
 */
export function evaluateFailToPassContract(
  task: string,
  sampleDoneFail: string,
  sampleDonePass?: string,
  requireApk = true,
): { ok: boolean; report: string } {
  const lines: string[] = [];
  let ok = true;
  const gFail = runStructuralGates(task, sampleDoneFail, { requireApk });
  if (gatesPassed(gFail)) {
    ok = false;
    lines.push("FAIL: sampleDoneFail unexpectedly passed gates");
  } else {
    lines.push("OK: sampleDoneFail is rejected by gates");
  }
  if (sampleDonePass) {
    const gPass = runStructuralGates(task, sampleDonePass, { requireApk });
    if (!gatesPassed(gPass)) {
      ok = false;
      lines.push(
        "FAIL: sampleDonePass rejected: " +
          gPass.filter((g) => !g.pass).map((g) => g.id).join(","),
      );
    } else {
      lines.push("OK: sampleDonePass passes gates");
    }
  }
  return { ok, report: lines.join("\n") };
}

/** Run fail-to-pass on all built-in fixtures that have samples. */
export function runFailToPassSelftest(): { ok: boolean; report: string } {
  const lines: string[] = [];
  let ok = true;
  for (const f of BUILTIN_TRACE_FIXTURES) {
    if (!f.sampleDoneFail && !f.sampleDonePass) continue;
    const r = evaluateFailToPassContract(
      f.task,
      f.sampleDoneFail || "no fail sample",
      f.sampleDonePass,
      f.expectApkGate,
    );
    if (!r.ok) {
      ok = false;
      lines.push(`[${f.id}] ${r.report}`);
    } else {
      lines.push(`[${f.id}] OK`);
    }
  }
  return { ok, report: lines.join("\n") };
}


/** Compact negative examples for the agent system context (similar past failures). */
export async function buildRegressionHintsForTask(task: string, limit = 4): Promise<string> {
  const t = (task || "").toLowerCase();
  const promoted = await loadPromotedFixtures();
  const recent = await loadRecentTraces(8);
  const lines: string[] = [];

  for (const f of promoted) {
    if (lines.length >= limit) break;
    const overlap =
      !f.task ||
      t.includes((f.task || "").slice(0, 24).toLowerCase()) ||
      /hello|apk|сборк|create|gradle/i.test(f.task);
    if (!overlap && f.cluster === "unknown") continue;
    lines.push(
      `- FIXTURE ${f.cluster || "fail"}: task≈"${(f.task || "").slice(0, 80)}" — NEVER repeat this DONE style: ${(f.sampleDoneFail || "").slice(0, 120)}`,
    );
  }

  for (const tr of recent) {
    if (lines.length >= limit) break;
    if (tr.status !== "fail" && tr.status !== "abort") continue;
    const failedGates = (tr.gates || []).filter((g) => !g.pass).map((g) => g.id);
    if (!failedGates.length && !tr.failureCluster) continue;
    lines.push(
      `- RECENT ${tr.failureCluster || "fail"} gates=[${failedGates.join(",")}] recipe=${tr.recipeId || "-"}`,
    );
  }

  if (!lines.length) return "";
  return (
    "[REGRESSION_HINTS — past failures on this device]\\n" +
    lines.join("\\n") +
    "\\nRequire absolute .apk path and real file for build tasks. Do not claim success without evidence.\\n"
  );
}


export function summarizeTraceStats(traces: AgentTrace[]): {
  total: number;
  pass: number;
  fail: number;
  abort: number;
  running: number;
} {
  const s = { total: traces.length, pass: 0, fail: 0, abort: 0, running: 0 };
  for (const t of traces) {
    if (t.status === "pass") s.pass++;
    else if (t.status === "fail") s.fail++;
    else if (t.status === "abort") s.abort++;
    else s.running++;
  }
  return s;
}
