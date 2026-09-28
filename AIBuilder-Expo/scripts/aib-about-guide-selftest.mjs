#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const about = fs.readFileSync(path.join(root, "lib/about-content.ts"), "utf8");
assert.match(about, /first-run|Перший запуск|Первый запуск/);
assert.match(about, /Авто \(телефон \+ модель\)|Auto \(device \+ model\)/);
assert.match(about, /Середовище|Среда|Runtime screen/);
const guide = fs.readFileSync(path.join(root, "lib/settings-guide.ts"), "utf8");
assert.match(guide, /id: "custom-2"/);
assert.match(guide, /без пресета DeepSeek|no DeepSeek preset/);
assert.match(guide, /id: "runtime-screen"/);
assert.match(guide, /id: "quick-checklist"/);
assert.match(guide, /Вивантажити з пам|Выгрузить из памяти|Unload from memory/);
console.log("aib-about-guide-selftest: OK");
