#!/usr/bin/env node
/**
 * Phase H — run all aib-*-selftest scripts (plan.md Definition of Done checklist).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const scriptsDir = path.join(root, "scripts");
const tests = fs
  .readdirSync(scriptsDir)
  .filter((f) => f.startsWith("aib-") && f.endsWith("-selftest.mjs"))
  .filter((f) => f !== "aib-acceptance-selftest.mjs")
  .sort();

let failed = 0;
const results = [];
for (const file of tests) {
  const r = spawnSync(process.execPath, [path.join(scriptsDir, file)], {
    cwd: root,
    encoding: "utf8",
    timeout: 60_000,
  });
  const ok = r.status === 0;
  if (!ok) failed++;
  const line = (r.stdout || r.stderr || "").trim().split("\n").pop() || `exit ${r.status}`;
  results.push({ file, ok, line });
  console.log(`${ok ? "OK" : "FAIL"}  ${file}  ${line}`);
}

console.log("---");
console.log(`AIB_ACCEPTANCE_${failed === 0 ? "OK" : "FAIL"} total=${tests.length} failed=${failed}`);
process.exit(failed === 0 ? 0 : 1);
