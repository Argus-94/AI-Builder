#!/usr/bin/env node
/**
 * Verify compilation guard: protected file hashes in guard module match disk,
 * baseline version syncs with package.json + RuntimeIdentity.
 * Does not mutate any compilation settings.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const guardPath = path.join(root, "lib/compilation-settings-guard.ts");
const guard = fs.readFileSync(guardPath, "utf8");

if (!guard.includes('export const COMPILATION_GUARD_VERSION = "1"')) {
  throw new Error("GUARD_VERSION_MISSING");
}
if (!guard.includes("createHash") || !guard.includes("readFileSync")) {
  throw new Error("GUARD_MUST_HASH_READ_ONLY");
}
if (/writeFileSync|appendFileSync|rmSync|mkdirSync|renameSync|copyFileSync/.test(guard)) {
  throw new Error("GUARD_MUTATES_FILES");
}

const verM = guard.match(/BASELINE_SOURCE_VERSION\s*=\s*"([^"]+)"/);
if (!verM) throw new Error("GUARD_SOURCE_VERSION_MISSING");
const baseline = verM[1];

const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (pkg.version !== baseline) {
  throw new Error(`VERSION_DRIFT:pkg=${pkg.version}:baseline=${baseline}`);
}

const identity = fs.readFileSync(path.join(root, "core/runtime/RuntimeIdentity.ts"), "utf8");
if (!identity.includes(`appVersion: "${baseline}"`)) {
  throw new Error(`IDENTITY_DRIFT: expected appVersion ${baseline}`);
}

// Parse PROTECTED_FILES entries from guard source
const entries = [...guard.matchAll(/\{\s*path:\s*"([^"]+)",\s*sha256:\s*"([a-f0-9]+)"\s*\}/g)];
if (entries.length < 5) throw new Error(`GUARD_PROTECTED_TOO_FEW:${entries.length}`);

const hash = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

for (const m of entries) {
  const file = m[1];
  const expected = m[2];
  const full = path.join(root, file);
  if (!fs.existsSync(full)) throw new Error(`MISSING:${file}`);
  const actual = hash(file);
  if (actual !== expected) {
    throw new Error(`BASELINE_DRIFT:${file}:expected=${expected}:actual=${actual}`);
  }
}

const forbidden = [
  "android/local.properties",
  "android/gradle.properties",
];
for (const file of forbidden) {
  // presence of generated android tree is ok; these specific overrides should not be committed as source-of-truth changes
  // only flag if they appear as protected entries
  if (entries.some((e) => e[1] === file)) {
    throw new Error(`FORBIDDEN_PROTECTED:${file}`);
  }
}

console.log("aib-compilation-settings-guard-selftest: OK", {
  baseline,
  protected: entries.length,
});
