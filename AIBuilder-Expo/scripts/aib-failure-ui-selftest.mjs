#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ui = fs.readFileSync(path.join(root, "app/runtime.tsx"), "utf8");
assert.match(ui, /failureRows/);
assert.match(ui, /listOpenFailures/);
assert.match(ui, /Журнал сбоев|Failure journal/);
const facade = fs.readFileSync(path.join(root, "core/RuntimeFacade.ts"), "utf8");
assert.match(facade, /listOpenFailures/);
assert.match(facade, /listRecentFailures/);
const agent = fs.readFileSync(path.join(root, "lib/termux-agent.ts"), "utf8");
assert.match(agent, /AGENT_PROTOCOL_ABORT/);
assert.match(agent, /Switch to a stronger model|HINT: Settings/);
console.log("AIB_FAILURE_UI_SELFTEST_OK");
