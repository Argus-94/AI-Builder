#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

const transfer = fs.readFileSync(path.join(root, "lib/profile-transfer.ts"), "utf8");
assert.match(transfer, /defaultProfileExportPath/);
assert.match(transfer, /Download\/AIBuilder-profile/);
assert.match(transfer, /fallbackProfileExportPath/);

const facade = fs.readFileSync(path.join(root, "core/RuntimeFacade.ts"), "utf8");
assert.match(facade, /defaultProfileExportPath/);

const rules = fs.readFileSync(path.join(root, "core/diagnostics/rules/BuiltinRules.ts"), "utf8");
assert.match(rules, /moe\.shizuku\.manager/);

const ui = fs.readFileSync(path.join(root, "app/runtime.tsx"), "utf8");
assert.match(ui, /Download\/AIBuilder-profile/);

console.log("aib-p2-profile-shizuku-selftest: OK");
