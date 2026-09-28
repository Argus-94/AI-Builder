#!/usr/bin/env node
/**
 * AI Builder Android E2E smoke harness.
 *
 * This intentionally fails closed when no physical/emulated Android device is
 * connected. It never reports a build/install/runtime check as passed merely
 * because the command was accepted by adb.
 *
 * Usage:
 *   node scripts/aib-android-e2e.mjs
 *   node scripts/aib-android-e2e.mjs --apk /path/to/app-debug.apk
 *   node scripts/aib-android-e2e.mjs --serial emulator-5554
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const PKG = "com.sakana.aibuilder";
const args = process.argv.slice(2);
const value = (flag) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};
const serial = value("--serial");
const apk = value("--apk");
const allowPartial = args.includes("--allow-partial");
const adb = (cmdArgs, opts = {}) => {
  const a = serial ? ["-s", serial, ...cmdArgs] : cmdArgs;
  return execFileSync("adb", a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts });
};
const fail = (msg) => { console.error(`AIB_ANDROID_E2E_FAIL: ${msg}`); process.exit(2); };
const ok = (msg) => console.log(`AIB_ANDROID_E2E_OK: ${msg}`);

try { execFileSync("adb", ["version"], { stdio: "ignore" }); }
catch { fail("adb is not installed or not on PATH"); }

let devices;
try { devices = adb(["devices"]); } catch (e) { fail(`adb devices failed: ${e.message}`); }
const rows = devices.split(/\r?\n/).slice(1).map(x => x.trim()).filter(Boolean);
const online = rows.filter(x => /\tdevice$/.test(x));
if (!online.length) fail("no Android device/emulator in 'device' state");
if (!serial && online.length > 1) console.warn(`AIB_ANDROID_E2E_WARN: ${online.length} devices; using first online device`);

if (apk) {
  if (!fs.existsSync(apk)) fail(`APK not found: ${apk}`);
  try { adb(["install", "-r", apk]); ok(`installed ${apk}`); }
  catch (e) { fail(`APK install failed: ${e.stderr || e.message}`); }
}

let packageDump;
try { packageDump = adb(["shell", "dumpsys", "package", PKG]); }
catch { fail(`package ${PKG} is not installed; pass --apk to install it`); }

const requiredPerms = [
  "android.permission.RECORD_AUDIO",
  "android.permission.INTERNET",
  "com.termux.permission.RUN_COMMAND",
];
for (const perm of requiredPerms) {
  if (!packageDump.includes(perm)) fail(`installed package is missing manifest permission ${perm}`);
  ok(`manifest contains ${perm}`);
}

try {
  adb(["shell", "monkey", "-p", PKG, "1"]);
  ok("launcher start command accepted");
} catch (e) { fail(`failed to launch app: ${e.stderr || e.message}`); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
await sleep(2500);
let pid = "";
try { pid = adb(["shell", "pidof", PKG]).trim(); } catch {}
if (!pid) fail("app is not running after launch");
ok(`app process running (pid=${pid})`);

// Runtime permission state. RECORD_AUDIO must be explicitly granted before
// STT can work; the harness does not silently grant it because that would hide
// the real user-permission flow.
let permState = "";
try { permState = adb(["shell", "cmd", "package", "check-permission", PKG, "android.permission.RECORD_AUDIO"]).trim(); } catch {}
let runtimeFailures = [];
if (/denied/i.test(permState)) {
  runtimeFailures.push("RECORD_AUDIO runtime permission denied");
} else if (/granted/i.test(permState)) {
  ok("RECORD_AUDIO runtime permission is granted");
} else {
  runtimeFailures.push(`RECORD_AUDIO runtime state unknown: ${permState || "unknown"}`);
}

// Native llama.rn verification: the package must expose a native library in
// the installed APK. This is necessary, but not sufficient, for real model
// loading; model inference is reported as pending until the app itself emits
// an inference result.
let libs = "";
try { libs = adb(["shell", "run-as", PKG, "ls", "lib"]).trim(); } catch {}
if (!libs) runtimeFailures.push("native library directory unavailable; llama.rn native loading not verified");
else ok("installed app exposes native library directory");

// Termux is optional, so its absence is not a failure for the base app. If it
// exists, report whether its package is visible and whether RUN_COMMAND is
// granted to AI Builder. The actual command round-trip is deliberately tested
// by the app's native bridge, not faked by adb.
let termux = false;
try { adb(["shell", "pm", "path", "com.termux"]); termux = true; } catch {}
if (!termux) {
  runtimeFailures.push("Termux is not installed; Termux bridge round-trip is unverified");
} else {
  ok("Termux package is installed");
  let runCommandState = "";
  try { runCommandState = adb(["shell", "cmd", "package", "check-permission", PKG, "com.termux.permission.RUN_COMMAND"]).trim(); } catch {}
  if (/granted/i.test(runCommandState)) ok("RUN_COMMAND runtime permission is granted");
  else runtimeFailures.push(`RUN_COMMAND runtime permission not granted: ${runCommandState || "unknown"}`);
}

if (runtimeFailures.length && !allowPartial) {
  fail(`strict runtime verification failed: ${runtimeFailures.join("; " )}. The harness will not report partial Android E2E as success. Use --allow-partial only for diagnostics.`);
}
if (runtimeFailures.length) console.warn(`AIB_ANDROID_E2E_PARTIAL: ${runtimeFailures.join("; " )}`);
else ok("strict Android installation/runtime prerequisites passed");
