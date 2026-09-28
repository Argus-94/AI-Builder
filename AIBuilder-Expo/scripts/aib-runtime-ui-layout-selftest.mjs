#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const ui = fs.readFileSync(path.join(root, "app/runtime.tsx"), "utf8");
assert.match(ui, /actionFull/);
assert.match(ui, /actionHint/);
assert.match(ui, /Цепочка внутри контейнера|In-container pipeline/);
assert.match(ui, /recreate_session/);
assert.match(ui, /Пересоздать сессию builder/);
assert.match(ui, /folder-open-outline/);
assert.match(ui, /construct-outline/);
// no more row of three flex actions for workspace pipeline
assert.doesNotMatch(ui, /onWorkspaceBuild[\s\S]{0,120}flexDirection: "row"/);
console.log("aib-runtime-ui-layout-selftest: OK");
