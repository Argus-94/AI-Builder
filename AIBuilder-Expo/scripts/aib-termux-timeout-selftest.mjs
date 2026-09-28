import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const bridge = fs.readFileSync(path.join(root, "plugins/withTermuxBridge.js"), "utf8");
const packs = fs.readFileSync(path.join(root, "lib/termux-packs.ts"), "utf8");
const required = [
  [/command -v timeout/, "timeout availability guard"],
  [/timeout --signal=TERM --kill-after=10s/, "TERM/KILL timeout enforcement"],
  [/result\.exitCode == 124/, "native timeout result handling"],
  [/\+ 15_000L/, "termination grace period"],
  [/RUN_COMMAND_PENDING_INTENT/, "official Termux result callback"],
  [/TermuxResultReceiver/, "private callback receiver"],
  [/AIBUILDER_TIMEOUT_UNAVAILABLE: install coreutils in Termux/, "coreutils fail-closed guard"],
];
for (const [re, name] of required) if (!re.test(bridge + "\n" + packs)) throw new Error(`missing: ${name}`);
console.log("AIB_TERMUX_TIMEOUT_SELFTEST_OK");
