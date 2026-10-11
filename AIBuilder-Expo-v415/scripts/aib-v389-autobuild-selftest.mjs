#!/usr/bin/env node
// Hermetic proof of the v389 self-healing build engine. Real bash executes the
// generated script; only external tools (apt-get, sdkmanager, curl, java) are stubs.
// This proves loop/diagnosis/fixer logic. It does NOT prove a real Gradle build.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { wrapWithAutobuild, parseAutobuildResult, AUTOBUILD_DEFAULT_MAX_ATTEMPTS } from "../lib/autobuild.ts";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "aib-v389-"));
const stubs = path.join(root, "stubs");
const home = path.join(root, "home");
fs.mkdirSync(stubs, { recursive: true });
fs.mkdirSync(path.join(home, "android-sdk/cmdline-tools/latest/bin"), { recursive: true });
fs.mkdirSync(path.join(root, "jdk/bin"), { recursive: true });
const callLog = path.join(root, "calls.log");

const write = (file, body) => { fs.writeFileSync(file, body, { mode: 0o755 }); };
write(path.join(root, "jdk/bin/java"), '#!/bin/bash\necho \'openjdk version "17.0.9" 2024-01-01\' >&2\n');
write(path.join(home, "android-sdk/cmdline-tools/latest/bin/sdkmanager"), `#!/bin/bash\necho "sdkmanager $*" >> "${callLog}"\nexit 0\n`);
for (const tool of ["curl", "unzip", "git"]) write(path.join(stubs, tool), "#!/bin/bash\nexit 0\n");
write(path.join(stubs, "apt-get"), `#!/bin/bash\necho "apt-get $*" >> "${callLog}"\nexit 0\n`);

function run(label, { backend = "termux", primary, max = 10, kind = "gradle", javaHome = path.join(root, "jdk"), extraEnv = {}, stubsDir = stubs }) {
  fs.rmSync(callLog, { force: true });
  const state = path.join(root, `state-${label}`);
  fs.mkdirSync(state, { recursive: true });
  fs.rmSync(path.join(home, ".aibuilder-gradle"), { recursive: true, force: true });
  const script = wrapWithAutobuild({ backend, projectKind: kind, primaryCommand: primary.replaceAll("@STATE@", state), maxAttempts: max });
  const file = path.join(root, `${label}.sh`);
  fs.writeFileSync(file, script);
  const syntax = spawnSync("bash", ["-n", file], { encoding: "utf8" });
  assert.equal(syntax.status, 0, `SYNTAX:${label}\n${syntax.stderr}`);
  const result = spawnSync("bash", [file], {
    encoding: "utf8",
    timeout: 120_000,
    env: { ...extraEnv, AIB_AB_JVM_GLOBS: javaHome === "/nonexistent" ? "/nonexistent/none" : undefined, PATH: `${stubsDir}:/usr/bin:/bin`, HOME: home, JAVA_HOME: javaHome, AIB_PRIVATE_ROOT: path.join(root, "private"), ANDROID_HOME: path.join(home, "android-sdk") },
  });
  const out = `${result.stdout}\n${result.stderr}`;
  const calls = fs.existsSync(callLog) ? fs.readFileSync(callLog, "utf8") : "";
  return { status: result.status, out, calls, gradleProps: (() => { try { return fs.readFileSync(path.join(home, ".aibuilder-gradle/gradle.properties"), "utf8"); } catch { return ""; } })() };
}

try {
  // A: two different failures are diagnosed and repaired, third attempt succeeds.
  const a = run("A", {
    primary: 'n=$(cat @STATE@/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > @STATE@/n\n' +
      'if [ $n -eq 1 ]; then echo "FAILURE: Build failed with an exception."; echo "Failed to find Build Tools revision 34.0.0"; exit 1; fi\n' +
      'if [ $n -eq 2 ]; then echo "java.lang.OutOfMemoryError: Java heap space"; exit 1; fi\n' +
      'echo "APK_PATH=/x/app-debug.apk"; exit 0',
  });
  assert.equal(a.status, 0, a.out);
  const ra = parseAutobuildResult(a.out);
  assert.ok(ra && ra.ok && ra.attempts === 3, `A_RESULT ${JSON.stringify(ra)}\n${a.out}`);
  assert.deepEqual([...ra.fixes].sort(), ["buildtools", "oom"]);
  assert.match(a.calls, /sdkmanager .*build-tools;34\.0\.0/);
  assert.match(a.gradleProps, /org\.gradle\.jvmargs=.*-Xmx\d+m/);
  assert.match(a.out, /APK_PATH=\/x\/app-debug\.apk/);

  // B: an unknown (source) error climbs the reset ladder, then hands over to the LLM.
  const b = run("B", { primary: 'echo "Main.kt:3: error: cannot find symbol foo"; exit 1' });
  assert.notEqual(b.status, 0);
  const rb = parseAutobuildResult(b.out);
  assert.ok(rb && !rb.ok && rb.needsLlm, `B_RESULT ${b.out}`);
  assert.equal(rb.attempts, 3, "unknown failure must use exactly two reset tiers before handoff");
  assert.match(rb.firstError, /cannot find symbol/);

  // C: the same repairable cause is bounded (3 fixer applications), never infinite.
  const c = run("C", { primary: 'echo "Failed to find Build Tools revision 34.0.0"; exit 1' });
  const fixerRuns = (c.out.match(/^\[AIB-AUTOBUILD [^\]]*\] fixer: buildtools$/gm) || []).length;
  assert.equal(fixerRuns, 3, `C_FIXER_LIMIT runs=${fixerRuns}`);
  assert.ok(parseAutobuildResult(c.out)?.needsLlm);

  // D: exit inside the primary command only ends that attempt; code is propagated.
  const d = run("D", { primary: "exit 7", max: 1 });
  assert.equal(d.status, 7, d.out);

  // E: backend-specific package manager and JDK package (no JDK available -> install path).
  const e1 = run("E-termux", { backend: "termux", primary: "exit 0", javaHome: "/nonexistent" });
  assert.match(e1.calls, /apt-get install .*openjdk-17(\s|$)/);
  const e2 = run("E-ubuntu", { backend: "ubuntu-proot", primary: "exit 0", javaHome: "/nonexistent" });
  assert.match(e2.calls, /apt-get install .*openjdk-17-jdk-headless/);

  // F: licenses and SDK platform fixers.
  const f = run("F", {
    primary: 'n=$(cat @STATE@/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > @STATE@/n\n' +
      'if [ $n -eq 1 ]; then echo "Failed to install the following Android SDK packages as some licences have not been accepted."; echo "Failed to find Platform SDK with path: platforms;android-35"; exit 1; fi\n' +
      'echo "APK_PATH=/x/a.apk"',
  });
  const rf = parseAutobuildResult(f.out);
  assert.ok(rf?.ok, f.out);
  assert.match(f.calls, /sdkmanager .*platforms;android-35/);
  assert.ok(fs.existsSync(path.join(home, "android-sdk/licenses/android-sdk-license")));

  // G: Flutter missing is diagnosed and the fixer is attempted (git is stubbed, so install itself cannot succeed here).
  const g = run("G", { kind: "flutter", max: 2, primary: 'echo "bash: flutter: command not found"; exit 127' });
  assert.match(g.out, /diagnosis: .*flutter/);
  assert.match(g.out, /fixer: flutter/);

  // H (v409): early-exit markers printed by the app's own build commands are diagnosed, not just reset.
  const proj = path.join(root, "proj"); fs.mkdirSync(path.join(proj, "app"), { recursive: true });
  fs.writeFileSync(path.join(proj, "app/build.gradle"), 'android {\n    compileSdk 35\n    buildToolsVersion "35.0.0"\n}\n');
  const h = run("H", { extraEnv: { AIB_PROJECT_BUILD_ROOT: proj, AIB_PROJECT_ROOT: proj }, primary: 'n=$(cat @STATE@/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > @STATE@/n\nif [ $n -eq 1 ]; then echo SDK_PLATFORM_MISSING; exit 1; fi\necho APK_PATH=/x/a.apk' });
  assert.ok(parseAutobuildResult(h.out)?.ok, h.out);
  assert.match(h.calls, /sdkmanager .*platforms;android-35/, "platform comes from the project's compileSdk");
  assert.match(h.calls, /sdkmanager .*build-tools;35\.0\.0/, "build-tools comes from the project's buildToolsVersion");
  const i = run("I", { primary: 'n=$(cat @STATE@/n 2>/dev/null || echo 0); n=$((n+1)); echo $n > @STATE@/n\nif [ $n -eq 1 ]; then echo JAVA_MISSING >&2; exit 21; fi\necho APK_PATH=/x/a.apk' });
  assert.ok(parseAutobuildResult(i.out)?.ok && parseAutobuildResult(i.out).fixes.includes("jdk"), i.out);
  const j = run("J", { primary: 'echo SKIP_OFFLINE_EXPO; exit 1' });
  const rj = parseAutobuildResult(j.out);
  assert.ok(rj && !rj.ok && !rj.needsLlm && rj.attempts === 1, `J_SKIP_OFFLINE_EXPO ${j.out}`);

  // K (v410): ARM + Termux: the native aarch64 NDK is installed under the requested version, system cmake is wired via cmake.dir.
  const fx = path.join(root, "fixture/android-ndk-r26b"); fs.mkdirSync(path.join(fx, "toolchains/llvm/prebuilt/linux-aarch64/bin"), { recursive: true });
  write(path.join(fx, "toolchains/llvm/prebuilt/linux-aarch64/bin/clang"), "#!/bin/bash\necho clang version 17\n");
  fs.writeFileSync(path.join(fx, "source.properties"), "Pkg.Desc = Android NDK\nPkg.Revision = 26.1.10909125-aarch64\n");
  assert.equal(spawnSync("zip", ["-qr", path.join(root, "ndk-fixture.zip"), "android-ndk-r26b"], { cwd: path.join(root, "fixture") }).status, 0);
  const stubsK = path.join(root, "stubsK"); fs.mkdirSync(stubsK, { recursive: true });
  write(path.join(stubsK, "curl"), `#!/bin/bash\nout=""; url=""\nwhile [ $# -gt 0 ]; do case "$1" in -o) out="$2"; shift;; http*) url="$1";; esac; shift; done\necho "curl $url" >> "${callLog}"\n[ -n "$out" ] && cp "${path.join(root, "ndk-fixture.zip")}" "$out"\nexit 0\n`);
  write(path.join(stubsK, "uname"), '#!/bin/bash\n[ "$1" = "-m" ] && echo aarch64 || echo Linux\n');
  for (const tool of ["git", "apt-get", "cmake", "ninja"]) write(path.join(stubsK, tool), "#!/bin/bash\nexit 0\n");
  const projK = path.join(root, "projK"); fs.mkdirSync(path.join(projK, "app"), { recursive: true });
  fs.writeFileSync(path.join(projK, "app/build.gradle"), 'android {\n    compileSdk 34\n    ndkVersion "26.1.10909125"\n    externalNativeBuild { cmake { path "CMakeLists.txt" } }\n}\n');
  const k = run("K", { stubsDir: stubsK, primary: "echo APK_PATH=/x/a.apk", extraEnv: { AIB_PROJECT_BUILD_ROOT: projK, AIB_PROJECT_ROOT: projK } });
  assert.ok(parseAutobuildResult(k.out)?.ok, k.out);
  const ndkDir = path.join(home, "android-sdk/ndk/26.1.10909125");
  assert.match(k.calls, /curl https:\/\/github\.com\/lzhiyong\/termux-ndk\/releases\/download\/android-ndk\/android-ndk-r26b-aarch64\.zip/, "release for 26.1.* is r26b");
  assert.ok(fs.existsSync(path.join(ndkDir, "toolchains/llvm/prebuilt/linux-aarch64/bin/clang")));
  assert.ok(fs.lstatSync(path.join(ndkDir, "toolchains/llvm/prebuilt/linux-x86_64")).isSymbolicLink(), "AGP host-tag path points to the aarch64 toolchain");
  assert.match(fs.readFileSync(path.join(ndkDir, "source.properties"), "utf8"), /Pkg\.Revision = 26\.1\.10909125\n/, "revision matches the requested ndkVersion");
  assert.match(fs.readFileSync(path.join(projK, "local.properties"), "utf8"), /^cmake\.dir=/m, "ARM uses system cmake");

  assert.equal(AUTOBUILD_DEFAULT_MAX_ATTEMPTS, 10);
  console.log("AIB_V389_AUTOBUILD_SELFTEST_OK scenarios=A-K loop=diagnose+fix+retry bounded=fixer-limit+reset-ladder handoff=NEEDS_LLM real-gradle=not-run");
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
