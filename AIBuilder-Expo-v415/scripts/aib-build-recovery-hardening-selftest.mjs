#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";

const repair = fs.readFileSync("lib/repair-script-runner.ts", "utf8");
const recipes = fs.readFileSync("core/recovery/DeterministicRepair.ts", "utf8");
const hints = fs.readFileSync("lib/agent-repair-hints.ts", "utf8");
const backend = fs.readFileSync("lib/agent-shell-backend.ts", "utf8");
const recovery = fs.readFileSync("lib/agent-recovery.ts", "utf8");
const policy = fs.readFileSync("lib/apk-build-safety-policy.ts", "utf8");
const standaloneWrapper = fs.readFileSync("scripts/repair/gradle-pkg.sh", "utf8");

const depsStart = repair.indexOf('"expo-deps": (');
const expoStart = repair.indexOf('"expo-cli": (', depsStart);
const signingStart = repair.indexOf('"signing-tools": (', expoStart);
assert.ok(depsStart >= 0 && expoStart > depsStart && signingStart > expoStart, "Expo repair recipes found");
const deps = repair.slice(depsStart, expoStart);
const expo = repair.slice(expoStart, signingStart);

assert.match(deps, /PRIMARY=""/);
assert.match(deps, /if pnpm install --frozen-lockfile[\s\S]*?PNPM_INSTALL_FAILED/);
assert.match(deps, /if yarn install --frozen-lockfile[\s\S]*?YARN_INSTALL_FAILED/);
assert.match(deps, /NPM_FALLBACK_START/);
assert.match(deps, /npm install --legacy-peer-deps[\s\S]*?NPM_FALLBACK_FAILED/);
assert.ok(deps.indexOf("mv node_modules") < deps.indexOf("NPM_FALLBACK_START"), "old node_modules is parked before attempts");
assert.match(deps, /restore_modules\(\)[\s\S]*?mv \"\$BACKUP\/node_modules\" \"\$ROOT\/node_modules\"/);
assert.match(deps, /trap restore_modules EXIT/);
assert.doesNotMatch(deps, /find \"\$PNPM_STORE\".*-delete/);

assert.match(expo, /EXPO_ANDROID_ALREADY_COMPLETE/);
assert.match(expo, /BACKUP_DIR=\$\(mktemp -d \"\$ROOT\/\.aib-expo-rollback/);
assert.match(expo, /mv android \"\$BACKUP_DIR\/android\"/);
assert.match(expo, /rollback_expo\(\)/);
assert.match(expo, /mv \"\$BACKUP_DIR\/android\" \"\$ROOT\/android\"/);
assert.match(expo, /trap rollback_expo EXIT/);
assert.ok(expo.indexOf("trap rollback_expo EXIT") < expo.indexOf("mv android"), "rollback is installed before the destructive move");
assert.match(expo, /EXPO_PREBUILD_FAILED/);
assert.match(expo, /EXPO_PREBUILD_OUTPUT_INVALID/);
assert.doesNotMatch(recipes, /rm -rf android; npx expo prebuild/);

assert.match(recipes, /JAVA_17_PLUS_ALREADY_AVAILABLE/);
assert.match(repair, /backend !== "termux" && id === "gradle-pkg"/);
assert.match(repair, /NO_VERIFIED_PROJECT_GRADLE_LAUNCHER/);
assert.match(repair, /AAPT2_MISSING_VERIFIED_SDK_ONLY/);
assert.doesNotMatch(repair, /sdkmanager[^\n]*install|pkg install -y gradle/);
assert.match(repair, /const backendJavaScript = backend === "termux"\s*\? selectedScript/);
assert.match(repair, /AIB_TOOLPACK_WRAPPER_JAR/);
assert.doesNotMatch(repair, /find "\$PREFIX"[^\n]*gradle-wrapper\.jar/);
assert.match(repair, /PROJECT_OUTSIDE_ALLOWED_ROOT/);
assert.match(standaloneWrapper, /PROJECT_OUTSIDE_ALLOWED_ROOT/);
assert.match(standaloneWrapper, /WRAPPER_JAR_ALREADY_PRESENT/);
assert.doesNotMatch(standaloneWrapper, /pkg install|find .*gradle-wrapper\.jar|cp -f|rm -rf|gradle-wrapper\.properties[^\n]*>/);
assert.match(repair, /"java-install": "set -e;.*pkg install -y openjdk-17/);
assert.match(repair, /backend !== "termux"[\s\S]*?apt-get install -y openjdk-17-jdk/);
assert.match(recovery, /APK_BUILD_SAFETY_POLICY/);
assert.match(policy, /AUTONOMOUS BUILD POLICY/);
assert.match(policy, /sdkmanager/);
assert.match(policy, /AIB_AUTOBUILD_NEEDS_LLM=1/);
assert.match(policy, /Never stop at the first error/);
assert.match(hints, /recipeForBackend\(id: string, backend: AgentShellBackend\)/);
assert.match(hints, /termuxHint: "java-install"/);
assert.doesNotMatch(hints, /apt-get install -y openjdk-17-jdk/);
assert.match(hints, /backend=\$\{getBuildBackend\(\)\}/);
assert.match(hints, /id === "gradle-pkg"/);
assert.match(hints, /termuxHint: "gradle-wrapper"/);
assert.match(hints, /selected Linux proot backend/);
assert.match(backend, /agentAutonomyPromptBlock/);

console.log("AIB_BUILD_RECOVERY_HARDENING_SELFTEST_OK expo=rollback npm=fallback-preserved java=no-downgrade backend=aware");
