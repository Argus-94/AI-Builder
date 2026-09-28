#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const builtinSource = fs.readFileSync(path.join(root, "lib", "builtin-build-script.ts"), "utf8");
const builtin = JSON.parse("\"" + builtinSource.match(/const SCRIPT_BODY: string = \"([\s\S]*?)\";\n\nexport function getBuiltinBuildScript/)[1] + "\"");
const agent = fs.readFileSync(path.join(root, "lib", "script-runner-agent.ts"), "utf8");
const runner = fs.readFileSync(path.join(root, "app", "script-runner.tsx"), "utf8");

const checks = [
  ["builtin shell enables pipefail", builtin.includes("set -e\nset -o pipefail")],
  ["launcher forces pipefail for every user script", builtinSource.includes('bash -o pipefail "$SCRIPT"')],
  ["Gradle pipeline uses tee but cannot hide exit code", /assembleDebug .*\| tee/.test(builtin) && builtin.includes("set -o pipefail")],
  ["Expo prebuild failure is no longer swallowed", builtin.includes('prebuild --platform android --clean --non-interactive 2>&1 | tail -5 >> "$LOG_FILE"') && !builtin.includes('prebuild --platform android --clean --non-interactive 2>&1 | tail -5 >> "$LOG_FILE" || true')],
  ["APK discovery avoids find|head under pipefail", builtin.includes('find app/build/outputs/apk -name "*.apk" -print -quit')],
  ["deterministic recovery exists", agent.includes("export function applyDeterministicRecoveryPatches")],
  ["memory recovery does not rewrite project Gradle settings", agent.includes("runtime-only recovery; project settings unchanged") && !/gradle\.properties[^\n]*sed -i/.test(agent)],
  ["NDK recovery is environment-only", agent.includes("project settings preserved") && !/27\.1\.12297006|27\.0\.12077973/.test(agent)],
  ["wrapper recovery preserves wrapper properties", agent.includes("wrapper properties restored") && agent.includes("Gradle settings (gradle.properties, gradle-wrapper.properties, local.properties)")],
  ["LLM is optional", agent.includes("invokeLLM?:")],
  ["UI explicitly states LLM-off recovery remains enabled", runner.includes("LLM analysis is off. Deterministic recovery is still enabled")],
  ["UI distinguishes known deterministic failures", runner.includes("корректный exit-код Gradle/tee")],
  ["builtin never rewrites package.json or local.properties", !builtin.includes("delete p.packageManager") && !/printf [^\n]*sdk\.dir[^\n]*> local\.properties/.test(builtin)],
  ["memory/NDK recovery uses runtime environment only", agent.includes("project settings preserved") && agent.includes("runtime-only recovery")],
];

const failed = checks.filter(([, ok]) => !ok);
for (const [name, ok] of checks) console.log(`${ok ? "OK" : "FAIL"}: ${name}`);
if (failed.length) process.exit(1);
console.log("AIB_SCRIPT_RUNNER_RECOVERY_SELFTEST_OK");
