#!/usr/bin/env node
/**
 * AI Builder — automatic Android native generation for cloud/CI builds.
 *
 * The source archive intentionally does not carry a generated android/ tree.
 * Expo CNG normally generates it during EAS Build, but some generic online
 * builders only run `pnpm install` and then look for Gradle. This postinstall
 * hook closes that gap without changing any Android compile settings: it only
 * runs the existing Expo config plugins when the native tree is missing.
 *
 * It is intentionally idempotent. If the Android tree and Gradle wrapper are
 * already present, nothing is executed.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();

// On a remote iOS EAS build, do not create an unrelated Android project.
if (process.env.EAS_BUILD_PLATFORM && process.env.EAS_BUILD_PLATFORM !== "android") {
  process.exit(0);
}

const android = path.join(root, "android");
const gradlew = path.join(android, "gradlew");

if (fs.existsSync(gradlew)) {
  process.exit(0);
}

console.log("[aib-auto-prebuild] Android native tree is missing.");
console.log("[aib-auto-prebuild] Running Expo prebuild automatically (no manual command required)…");

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(
  npx,
  ["expo", "prebuild", "--platform", "android", "--no-install"],
  { cwd: root, stdio: "inherit", shell: false }
);

if (result.error) {
  console.error(`[aib-auto-prebuild] Failed to start Expo: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  console.error(`[aib-auto-prebuild] Expo prebuild failed with exit code ${result.status ?? 1}.`);
  process.exit(result.status ?? 1);
}

if (!fs.existsSync(gradlew)) {
  console.error("[aib-auto-prebuild] Prebuild finished, but android/gradlew is still missing.");
  process.exit(1);
}

console.log("[aib-auto-prebuild] Android project is ready.");
