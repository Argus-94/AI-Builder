import type { DeviceAgentBridge } from "./DeviceAgentBridge";
import { findUiNodes, nodeCenter, parseUiHierarchy, type UiSnapshot } from "./AccessibilityTree";
import type { DeviceTestCase, DeviceTestSuite } from "./DeviceTestPlanner";
import { evaluateDeviceTestPlan } from "./DeviceTestAssertions";
import type { DeviceEvidenceStore, EvidenceRef } from "./DeviceEvidenceStore";
import type { DeviceTestReport, DeviceCaseReport } from "./DeviceTestReport";
import { renderDeviceTestReport } from "./DeviceTestReport";

export type DeviceTestRunnerOptions = { apkPath: string; packageName?: string; suite: DeviceTestSuite; evidence: DeviceEvidenceStore; maxActionsPerCase?: number; caseTimeoutMs?: number; settleMs?: number; caseIds?: string[] };
export type DeviceTestSuiteRun = { report: DeviceTestReport; markdown: string; packageName?: string };

export async function runDeviceTestSuite(bridge: DeviceAgentBridge, options: DeviceTestRunnerOptions): Promise<DeviceTestSuiteRun> {
  const startedAt = new Date().toISOString();
  await options.evidence.init();
  let packageName = options.packageName;
  if (!packageName) {
    const detected = await bridge.detectPackageName(options.apkPath);
    packageName = parsePackage(detected.stdout || detected.stderr);
  }
  const cases: DeviceCaseReport[] = [];
  const selected = options.caseIds?.length ? new Set(options.caseIds.slice(0, 8)) : undefined;
  for (const testCase of options.suite.cases.slice(0, 8)) {
    if (selected && !selected.has(testCase.id)) continue;
    cases.push(await runCase(bridge, testCase, options, packageName));
  }
  const totals = { cases: cases.length, passed: cases.filter(c => c.status === "passed").length, failed: cases.filter(c => c.status === "failed").length, blocked: cases.filter(c => c.status === "blocked").length };
  const report: DeviceTestReport = { version: 1, runId: options.evidence.root.split(/[\\/]/).pop() || "run", goal: options.suite.goal, packageName, startedAt, finishedAt: new Date().toISOString(), status: totals.failed || totals.blocked ? "failed" : "passed", totals, cases, evidenceRoot: options.evidence.root };
  const markdown = renderDeviceTestReport(report, options.evidence);
  await options.evidence.writeJson("_run", "report.json", report);
  await options.evidence.write("_run", "report.md", markdown, "report");
  return { report, markdown, packageName };
}

async function runCase(bridge: DeviceAgentBridge, testCase: DeviceTestCase, options: DeviceTestRunnerOptions, packageName?: string): Promise<DeviceCaseReport> {
  const started = Date.now();
  const stepReports: DeviceCaseReport["steps"] = [];
  try {
    const install = await bridge.install(options.apkPath);
    if (install.exitCode !== 0) return { id: testCase.id, title: testCase.title, status: "blocked", reason: `INSTALL_FAILED:${install.stderr || install.stdout}`.slice(0, 500), steps: [] };
    let actionCount = 0;
    const maxActions = Math.max(1, Math.min(20, Math.floor(options.maxActionsPerCase ?? 12)));
    for (const step of testCase.steps.slice(0, 12)) {
      if (step.action && ++actionCount > maxActions) return { id: testCase.id, title: testCase.title, status: "blocked", reason: "MAX_ACTIONS_REACHED", steps: stepReports };
      if (Date.now() - started > (options.caseTimeoutMs ?? 120_000)) return { id: testCase.id, title: testCase.title, status: "blocked", reason: "CASE_TIMEOUT", steps: stepReports };
      const evidence: EvidenceRef[] = [];
      const before = await capture(bridge, options.evidence, testCase.id, step.id, "before"); evidence.push(...before.refs);
      let snapshot = before.snapshot;
      let actionStatus = "observed";
      if (step.action) {
        const action = await executeAction(bridge, step.action, snapshot, packageName);
        actionStatus = action.ok ? "executed" : `action_failed:${action.reason}`;
        if (!action.ok) { stepReports.push({ id: step.id, status: "failed", assertionsPassed: false, evidence }); return { id: testCase.id, title: testCase.title, status: "failed", reason: action.reason, steps: stepReports }; }
      }
      const after = await capture(bridge, options.evidence, testCase.id, step.id, "after"); evidence.push(...after.refs); snapshot = after.snapshot;
      const plan = { version: 1 as const, packageName, goal: testCase.goal, steps: [step] };
      const assertionResult = evaluateDeviceTestPlan(plan, snapshot);
      const passed = assertionResult.passed;
      if (step.assertions.length && !passed) {
        stepReports.push({ id: step.id, status: "failed", assertionsPassed: false, evidence });
        const failures = assertionResult.stepResults.flatMap((stepResult) => stepResult.assertions.filter((item) => !item.passed).map((item) => item.message));
        return { id: testCase.id, title: testCase.title, status: "failed", reason: `ASSERTION_FAILED:${failures.join("|")}`.slice(0, 500), steps: stepReports };
      }
      const log = await bridge.logcat(["-d", "-t", "120"]); evidence.push(await options.evidence.write(testCase.id, `${step.id}-logcat.txt`, log.stdout || log.stderr, "logcat"));
      stepReports.push({ id: step.id, status: actionStatus, assertionsPassed: passed, evidence });
      if (step.action?.type === "wait") await delay(step.action.durationMs || 500);
    }
    return { id: testCase.id, title: testCase.title, status: "passed", reason: "ALL_STEPS_PASSED", steps: stepReports };
  } catch (e) {
    return { id: testCase.id, title: testCase.title, status: "blocked", reason: e instanceof Error ? e.message : String(e), steps: stepReports };
  }
}

async function capture(bridge: DeviceAgentBridge, store: DeviceEvidenceStore, testId: string, stepId: string, phase: string) {
  const refs: EvidenceRef[] = [];
  const b64 = await bridge.screenshotBase64();
  refs.push(await store.write(testId, `${stepId}-${phase}.png`, base64ToBytes(b64), "screenshot"));
  const ui = await bridge.uiHierarchy();
  refs.push(await store.write(testId, `${stepId}-${phase}.xml`, ui.stdout || ui.stderr, "ui_hierarchy"));
  return { refs, snapshot: parseUiHierarchy(ui.stdout || "") };
}

async function executeAction(bridge: DeviceAgentBridge, action: any, snapshot: UiSnapshot, packageName?: string): Promise<{ok:boolean; reason:string}> {
  if (action.type === "launch") { const r = await bridge.launch(packageName || ""); return { ok: r.exitCode === 0, reason: r.stderr || "LAUNCH_FAILED" }; }
  if (action.type === "wait") { await delay(action.durationMs || 500); return { ok: true, reason: "WAIT" }; }
  if (action.type === "tap_selector" || action.type === "type_text") {
    const nodes = findUiNodes(snapshot.root, action.selector || {});
    if (!nodes.length) return { ok: false, reason: "SELECTOR_NOT_FOUND" };
    const center = nodeCenter(nodes[0]);
    if (!center) return { ok: false, reason: "SELECTOR_HAS_NO_BOUNDS" };
    const tap = await bridge.tap(center.x, center.y);
    if (tap.exitCode !== 0) return { ok: false, reason: tap.stderr || "TAP_FAILED" };
    if (action.type === "type_text") {
      if (!action.text) return { ok: true, reason: "TAPPED_EMPTY_TEXT" };
      const input = await bridge.inputText(action.text);
      if (input.exitCode !== 0) return { ok: false, reason: input.stderr || "INPUT_FAILED" };
    }
    return { ok: true, reason: "ACTION_OK" };
  }
  if (action.type === "swipe") { const r = await bridge.swipe(action.x1, action.y1, action.x2, action.y2, action.durationMs); return { ok: r.exitCode === 0, reason: r.stderr || "SWIPE_FAILED" }; }
  return { ok: false, reason: "UNSUPPORTED_ACTION" };
}
function base64ToBytes(value: string): Uint8Array {
  const binary = globalThis.atob ? globalThis.atob(value) : value;
  const out = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i); return out;
}
function parsePackage(text: string): string | undefined { return text.match(/package(?:Name)?[=: ]+['"]?([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)/i)?.[1] || text.match(/name=['"]([A-Za-z0-9_]+(?:\.[A-Za-z0-9_]+)+)['"]/)?.[1]; }
function delay(ms: number): Promise<void> { return new Promise(r => setTimeout(r, Math.max(0, Math.min(10000, ms)))); }
