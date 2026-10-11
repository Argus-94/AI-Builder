#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const checks = [
  ["identity/release contract", ["scripts/aib-release-selftest.mjs"]],
  ["source routing and hostile archive preflight", ["scripts/aib-project-source-routing-selftest.mjs"]],
  ["v385 missing-utility archive recovery and build continuation", ["--experimental-transform-types", "scripts/aib-v385-build-recovery-selftest.mjs"]],
  ["project-local build runner and offline recovery simulations", ["--experimental-strip-types", "scripts/aib-project-build-runner-selftest.mjs"]],
  ["v387 atomic source-proof recovery and mocked native runner", ["--experimental-strip-types", "scripts/aib-v386-project-build-handoff-selftest.mjs"]],
  ["v389 self-healing autobuild engine (real bash, stubbed tools)", ["--experimental-strip-types", "scripts/aib-v389-autobuild-selftest.mjs"]],
  ["v409 real runner + wrapped engine end to end (stubbed tools)", ["--experimental-strip-types", "scripts/aib-v409-runner-e2e-selftest.mjs"]],
  ["v389 autobuild body in sync with shell source", ["scripts/aib-gen-autobuild.mjs", "--check"]],
  ["v389 unrestricted agent shell with catastrophic floor", ["--experimental-strip-types", "scripts/aib-v389-guard-selftest.mjs"]],
  ["source compile/API contract", ["scripts/aib-source-compile-audit-selftest.mjs"]],
  ["backend-aware recovery/toolchain policy", ["scripts/aib-recovery-toolchain-layer-selftest.mjs"]],
  ["single APK toolchain policy across prompts/repairs", ["scripts/aib-apk-policy-consistency-selftest.mjs"]],
  ["deterministic repair safety", ["scripts/aib-build-recovery-hardening-selftest.mjs"]],
  ["generic script-runner recovery remains fail-closed", ["scripts/aib-script-runner-recovery-selftest.mjs"]],
  ["APK/AAB ZIP/signature gate behavior", ["--experimental-strip-types", "scripts/aib-apk-validation-selftest.mjs"]],
  ["build log repair regression", ["scripts/aib-build-log-repair-selftest.mjs"]],
  ["recorded-format fake agent/recovery scenarios", ["--experimental-strip-types", "scripts/aib-sim-agent-scenarios.mjs"]],
  ["antigravity native-priority / tools / settings", ["scripts/aib-native-priority-selftest.mjs"]],
  ["agent tool registry parity", ["scripts/aib-agent-tool-registry-selftest.mjs"]],
  ["shell-comment and full-source syntax", ["scripts/aib-ts-shell-comment-syntax-selftest.mjs"]],
  ["full source syntax audit", ["scripts/aib-full-source-syntax-selftest.mjs"]],
];

console.log(`AIBuilder-Expo pre-release checks (${process.version})`);
console.log("Evidence is source/static/hermetic only; no Android device, emulator, live model, or APK build is implied.\n");
const results = [];
for (const [label, args] of checks) {
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  const code = result.status ?? 1;
  results.push({ label, code });
  console.log(`[${code === 0 ? "PASS" : "FAIL"}] ${label} (exit=${code})`);
}

console.log("\n=== Summary ===");
for (const row of results) console.log(`${row.code === 0 ? "PASS" : "FAIL"}  ${row.label}`);
const failed = results.filter((row) => row.code !== 0);
console.log(`\n${results.length - failed.length}/${results.length} checks passed; ${failed.length} failed.`);
console.log("Android device smoke status remains NOT RUN unless separately recorded in DEVICE_SMOKE.md.");
if (failed.length) process.exitCode = 1;
