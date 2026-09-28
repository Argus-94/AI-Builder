/**
 * ИИ-агент для «Запуск сценария»:
 * следит за логом сборки, классифицирует сбой и применяет
 * детерминированные патчи (память / broken pipe / Gradle) +
 * при необходимости делегирует LLM (sendMessage) более сложный фикс.
 */

import { runShellCommand, type TermuxCommandResult } from "./termux-bridge";
import {
  classifyRecoveryFailure,
  buildRecoveryContext,
  type RecoveryState,
} from "./agent-recovery";
import { buildLlmRepairContext } from "./task-prompts";
import {
  buildTermuxLaunchCommand,
  buildStopCommand,
  materializeUserScript,
  AIB_USER_SCRIPT_PATH,
} from "./builtin-build-script";
import {
  runBuildPreflight,
  annotateTermuxResult,
  isTermuxNoOutput,
} from "./apk-build-engine";
import { persistentLogger } from "./persistent-logger";
import { withForegroundTask } from "./foreground-task";

export type ScriptAgentEvent =
  | { type: "attempt"; attempt: number; maxAttempts: number }
  | { type: "failed"; attempt: number; state: RecoveryState; logTail: string }
  | { type: "patch"; attempt: number; description: string }
  | { type: "llm"; attempt: number; note: string }
  | { type: "success"; attempt: number; logTail: string }
  | { type: "aborted" }
  | { type: "exhausted"; logTail: string };

export interface ScriptAgentOptions {
  /** Optional. User scripts may not need a ZIP path. */
  zipPath?: string;
  scriptBody: string;
  /** If already written to disk by Script Runner; still re-materialized after patches. */
  scriptPath?: string;
  maxAttempts?: number;
  /** LLM entry point (e.g. sendMessage). Optional. */
  invokeLLM?: (prompt: string) => Promise<string>;
  onEvent?: (ev: ScriptAgentEvent) => void;
  shouldAbort?: () => boolean;
  timeoutMs?: number;
}

export interface ScriptAgentResult {
  ok: boolean;
  attempts: number;
  exitCode: number;
  log: string;
  patched: string[];
  aborted?: boolean;
}

/** Memory / process-kill patterns typical on Android Termux. */
export function isMemoryPressureFailure(log: string): boolean {
  const l = (log || "").toLowerCase();
  return (
    /broken pipe/.test(l) ||
    /out of memory|outofmemory|oom|java\.lang\.outofmemoryerror/.test(l) ||
    /killed|sigkill|signal 9|process .* killed/.test(l) ||
    /cannot allocate memory|enomem|low memory|memory pressure/.test(l) ||
    /gradle.*daemon.*(disappeared|disappeared unexpectedly|died)/.test(l) ||
    /the daemon disappeared unexpectedly|daemon has disappeared/.test(l) ||
    /gc overhead limit|metaspace/.test(l) && /error|failed|exception/.test(l)
  );
}

/** Expo / RN / AGP native: CMake configure or NDK missing / wrong path. */
export function isNdkCmakeFailure(log: string): boolean {
  const l = log || "";
  return (
    /configureCMake(?:Debug|Release)?/i.test(l) ||
    /CMake\s+Error/i.test(l) ||
    /No CMAKE_ANDROID_NDK|ANDROID_NDK (not|is not) (set|found)/i.test(l) ||
    /NDK (was )?not found|ndk not configured|Unable to locate NDK/i.test(l) ||
    (/\[CXX\d+\].*NDK/i.test(l) && /FAILED|CMake Error|configureCMake/i.test(l)) ||
    (/externalNativeBuild|prefab.*failed|ninja:\s*error/i.test(l) &&
      /ndk|cmake|abi|arm64|aarch64/i.test(l))
  );
}

/**
 * Inject NDK environment variables into a
 * user build script. Safe for Expo/RN and plain AGP projects. Idempotent (AIB_NDK_FIX).
 */
export function applyNdkPatchesToScript(scriptBody: string): {
  body: string;
  description: string;
} {
  let body = scriptBody;
  if (/AIB_NDK_FIX/.test(body)) {
    return { body, description: "NDK-блок уже есть" };
  }

  const block = `
# AIB_NDK_FIX — auto: Termux NDK for CMake / expo-modules-core / RN native
aib_ensure_ndk() {
  local SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-\$PREFIX/opt/android-sdk}}"
  local NDK=""
  for d in \\
    "\${ANDROID_NDK_HOME:-}" \\
    "\${ANDROID_NDK_ROOT:-}" \\
    "\$PREFIX/opt/android-ndk" \\
    "\$PREFIX/lib/android-ndk" \\
    "\$SDK/ndk-bundle" \\
    \$(ls -d "\$SDK/ndk"/* 2>/dev/null | tail -1)
  do
    [ -n "\$d" ] && [ -d "\$d" ] && { [ -f "\$d/ndk-build" ] || [ -d "\$d/toolchains" ]; } && { NDK="\$d"; break; }
  done
  if [ -z "\$NDK" ]; then
    echo "AIB_NDK_FIX: NDK not found under \$PREFIX/opt/android-ndk" >&2
    return 1
  fi
  export ANDROID_NDK_HOME="\$NDK"
  export ANDROID_NDK_ROOT="\$NDK"
  echo "AIB_NDK_FIX: ANDROID_NDK_HOME=\$ANDROID_NDK_HOME"
  return 0
}
`;

  // Insert after first set -e, or at top
  if (/^set -e\s*$/m.test(body)) {
    body = body.replace(/^(set -e\s*\n)/m, `$1${block}`);
  } else if (/^#!/m.test(body)) {
    body = body.replace(/^(#![^\n]*\n)/, `$1${block}`);
  } else {
    body = `${block}\n${body}`;
  }

  // Call before common build entry points if not already called
  if (!/aib_ensure_ndk\s*\(/.test(body) || !/aib_ensure_ndk\s*$/m.test(body)) {
    const call = "\naib_ensure_ndk || true\n";
    // `/` в regex-литерале экранируем как \/ — иначе парсер закрывает литерал
    // на первом `/` → SyntaxError: Invalid regular expression flag (Metro/Babel)
    if (
      /assembleDebug|assembleRelease|\.\/gradlew|gradlew\s/.test(body) &&
      !/aib_ensure_ndk\s*\|\|/.test(body)
    ) {
      body = body.replace(
        /(\n)([^\n]*(?:bash\s+)?\.?\/?gradlew\s|bash\s+gradlew\s)/,
        `${call}$1$2`,
      );
      // Also before "Запуск: bash gradlew" style logs then command
      if (!/aib_ensure_ndk\s*\|\|/.test(body)) {
        body = body.replace(
          /(\n)(export ANDROID_HOME=)/,
          `${call}$1$2`,
        );
      }
      if (!/aib_ensure_ndk\s*\|\|/.test(body)) {
        // fallback: call once after function definition region — before first echo ===
        body = body.replace(
          /(# AIB_NDK_FIX[\s\S]*?\n\})\n/,
          `$1\n${call}`,
        );
      }
    } else if (!/aib_ensure_ndk\s*\|\|/.test(body)) {
      body = body.replace(
        /(# AIB_NDK_FIX[\s\S]*?\n\})\n/,
        `$1\n${call}`,
      );
    }
  }

  return {
    body,
    description: "NDK environment export only; project settings preserved",
  };
}

/**
 * Deterministic recovery that does not require an LLM.
 *
 * Important invariant: recovery must not rewrite the target project's
 * Gradle settings (gradle.properties, gradle-wrapper.properties, local.properties)
 * attempt work. When a wrapper JAR is missing, an already installed Gradle
 * executable may generate the JAR; the exact existing wrapper properties are
 * backed up and restored byte-for-byte.
 */
export function applyDeterministicRecoveryPatches(scriptBody: string, log: string): {
  body: string;
  description: string;
} {
  let body = scriptBody;
  const l = String(log || "").toLowerCase();
  const notes: string[] = [];

  // Never let tee hide a failing Gradle/build command. The launcher also
  // executes with bash -o pipefail, but keeping this in patched scripts makes
  // the invariant explicit for retries and exported scripts.
  if (!/set -o pipefail|set -o pipefail\b/.test(body)) {
    if (/^set -e\s*$/m.test(body)) {
      body = body.replace(/^(set -e\s*\n)/m, "$1set -o pipefail\n");
    } else if (/^#![^\n]*\n/.test(body)) {
      body = body.replace(/^(#![^\n]*\n)/, "$1set -o pipefail\n");
    } else {
      body = `set -o pipefail\n${body}`;
    }
    notes.push("shell: pipefail для корректного exit-кода Gradle/tee");
  }

  const wrapperFailure =
    /gradlewrappermain|gradle-wrapper\.jar|no_verified_gradle_wrapper|wrapper_jar_missing|classnotfoundexception.*gradlewrapper/i.test(
      log || "",
    );

  if (wrapperFailure && !/AIB_WRAPPER_RECOVERY/.test(body)) {
    const block = `
# AIB_WRAPPER_RECOVERY — deterministic, no-LLM recovery
# Only repairs a missing wrapper JAR. Existing wrapper properties are restored
# byte-for-byte, so the project's Gradle distribution/settings are not changed.
aib_recover_wrapper_jar() {
  local props="gradle/wrapper/gradle-wrapper.properties"
  local jar="gradle/wrapper/gradle-wrapper.jar"
  local gradle_bin=""
  local gradle_ver=""
  [ -s "$jar" ] && return 0
  [ -f "$props" ] || return 1
  gradle_ver=$(sed -n 's#^distributionUrl=.*gradle-\\([^/-]*\\)-.*#\\1#p' "$props" | head -1)
  [ -n "$gradle_ver" ] || return 1
  for g in "$PREFIX/opt/gradle/bin/gradle" "$PREFIX/bin/gradle"; do
    if [ -x "$g" ]; then gradle_bin="$g"; break; fi
  done
  [ -n "$gradle_bin" ] || gradle_bin=$(command -v gradle 2>/dev/null || true)
  [ -n "$gradle_bin" ] || return 1
  cp -f "$props" "$props.aib-wrapper-backup" 2>/dev/null || return 1
  set +e
  "$gradle_bin" -p . wrapper --gradle-version "$gradle_ver" --distribution-type bin >/dev/null 2>&1
  local ec=$?
  set -e
  if [ -f "$props.aib-wrapper-backup" ]; then
    mv -f "$props.aib-wrapper-backup" "$props"
  fi
  if [ "$ec" -eq 0 ] && [ -s "$jar" ]; then
    echo "AIB_WRAPPER_RECOVERY: generated wrapper JAR using installed Gradle $gradle_ver; wrapper properties restored"
    return 0
  fi
  rm -f "$props.aib-wrapper-backup" 2>/dev/null || true
  return 1
}
aib_recover_wrapper_jar || true
`;
    if (/^set -e\s*$/m.test(body)) {
      body = body.replace(/^(set -e\s*\n)/m, `$1${block}`);
    } else if (/^#!/m.test(body)) {
      body = body.replace(/^(#![^\n]*\n)/, `$1${block}`);
    } else {
      body = `${block}\n${body}`;
    }
    notes.push("wrapper: восстановление JAR без изменения wrapper properties");
  }

  // Network failures: retry the script with a short backoff, but do not
  // rewrite dependency versions, repositories, or project Gradle settings.
  if (/could not resolve|unable to fetch|connection reset|timed out|timeout|http\s*(?:429|502|503|504)|network error/i.test(l)
      && !/AIB_NETWORK_RETRY/.test(body)) {
    const block = `
# AIB_NETWORK_RETRY — deterministic retry only; no dependency/config mutation
sleep 3
echo "AIB_NETWORK_RETRY: retrying after transient network failure"
`;
    if (/^set -e\s*$/m.test(body)) {
      body = body.replace(/^(set -e\s*\n)/m, `$1${block}`);
    } else if (/^#!/m.test(body)) {
      body = body.replace(/^(#![^\n]*\n)/, `$1${block}`);
    } else {
      body = `${block}\n${body}`;
    }
    notes.push("network: повтор с backoff без изменения проекта");
  }

  return {
    body,
    description: notes.join("; ") || "deterministic recovery",
  };
}

/**
 * Apply in-memory transforms to the script body for the next attempt.
 * Level increases aggressiveness (0 = light, 1 = medium, 2 = aggressive).
 */
export function applyMemoryPatchesToScript(scriptBody: string, level: number): {
  body: string;
  description: string;
} {
  let body = scriptBody;
  const notes: string[] = [];
  const profiles = [
    { xmx: "2048m", meta: "512m", workers: 2 },
    { xmx: "1536m", meta: "384m", workers: 1 },
    { xmx: "1024m", meta: "256m", workers: 1 },
  ];
  const profile = profiles[Math.min(Math.max(level, 0), profiles.length - 1)];

  // Recovery must not rewrite project gradle.properties / wrapper settings.
  // Apply memory pressure through command-line/system properties only.
  if (!/AIB_MEM_CLEANUP/.test(body)) {
    const cleanup = `
# AIB_MEM_CLEANUP — deterministic process cleanup; does not edit project files
aib_mem_cleanup() {
  pkill -f 'gradlew|GradleDaemon' 2>/dev/null || true
  sleep 0.5
  pkill -9 -f 'gradlew|GradleDaemon' 2>/dev/null || true
  sync 2>/dev/null || true
}
`;
    if (/^set -e\s*$/m.test(body)) {
      body = body.replace(/^(set -e\s*\n)/m, `$1${cleanup}`);
    } else if (/^#![^\n]*\n/.test(body)) {
      body = body.replace(/^(#![^\n]*\n)/, `$1set -e\n${cleanup}`);
    } else {
      body = `set -e\n${cleanup}\n${body}`;
    }
    notes.push("cleanup Java/Gradle процессов");
  }

  // Never alter gradle.properties. Add/replace CLI flags at the actual Gradle
  // invocation so the source project's compile configuration remains intact.
  const gradleFlags = `--no-daemon --max-workers=${profile.workers} -Dorg.gradle.jvmargs=-Xmx${profile.xmx}\\ -XX:MaxMetaspaceSize=${profile.meta}\\ -Dfile.encoding=UTF-8`;
  if (!/AIB_MEM_GRADLE_FLAGS/.test(body)) {
    body = body.replace(
      /(^|\n)(\s*)(bash\s+gradlew|\.\/gradlew|sh\s+gradlew)(?![^\n]*AIB_MEM_GRADLE_FLAGS)([^\n]*)/g,
      (_m, prefix, indent, cmd, rest) => `${prefix}${indent}# AIB_MEM_GRADLE_FLAGS — runtime-only recovery; project settings unchanged\n${indent}aib_mem_cleanup 2>/dev/null || true\n${indent}${cmd} ${gradleFlags} ${rest}\n${indent}# AIB_MEM_GRADLE_FLAGS`,
    );
  }

  if (!/AIB_MEM_GRADLE_FLAGS/.test(body)) {
    // Common command assembled through a variable: append a runtime env instead.
    body = `# AIB_MEM_GRADLE_FLAGS — runtime-only recovery; project settings unchanged\nexport GRADLE_OPTS="${`-Dorg.gradle.jvmargs=-Xmx${profile.xmx} -XX:MaxMetaspaceSize=${profile.meta} -Dfile.encoding=UTF-8`} ${'${GRADLE_OPTS:-}'}"\n${body}`;
  }

  notes.push(`runtime Gradle memory: Xmx=${profile.xmx}, Metaspace=${profile.meta}, workers=${profile.workers}, daemon=false`);
  return { body, description: notes.join("; ") || "memory patch" };
}

/** Prepend a one-shot shell preamble for memory cleanup before script. */
export function buildMemoryPreamble(level: number): string {
  return [
    "set +e",
    "pkill -f 'gradlew|GradleDaemon|java.*gradle' 2>/dev/null || true",
    "sleep 0.4",
    "pkill -9 -f 'gradlew|GradleDaemon' 2>/dev/null || true",
    level >= 1 ? "sync; echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true" : "true",
    "set -e",
    "",
  ].join("\n");
}

function logTail(r: TermuxCommandResult, n = 50): string {
  return [r.stdout, r.stderr]
    .filter(Boolean)
    .join("\n")
    .split("\n")
    .slice(-n)
    .join("\n");
}

function isSuccess(r: TermuxCommandResult): boolean {
  if (r.timedOut) return false;
  if (r.exitCode !== 0) return false;
  if (isTermuxNoOutput(r)) return false;
  const all = `${r.stdout || ""}\n${r.stderr || ""}`;
  // Prefer explicit success markers from our scripts
  if (/SIGNED_V1_V2_V3_OK|УСПЕХ! Готовый APK|СБОРКА ЗАВЕРШЕНА|УСПЕШНО|Готовый APK|BUILD SUCCESSFUL/i.test(all)) return true;
  // exit 0 without hard failure markers
  if (/BUILD FAILED|ERROR: BUILD_FAILED|ZIPALIGN_MISSING|APKSIGNER_MISSING|TERMUX_NO_OUTPUT/i.test(all)) return false;
  // Completely empty channel with exit 0 is suspicious; short "OK" is fine
  if (all.trim().length === 0) return false;
  return true;
}

export async function runScriptWithAgent(opts: ScriptAgentOptions): Promise<ScriptAgentResult> {
  return withForegroundTask("agent", "Script agent / build recovery", async () =>
    runScriptWithAgentInner(opts),
  );
}

async function runScriptWithAgentInner(opts: ScriptAgentOptions): Promise<ScriptAgentResult> {
  const maxAttempts = Math.max(1, Math.min(opts.maxAttempts ?? 4, 6));
  const watchId = `script-agent-${Date.now()}`;
  const markAgentHealth = async (health: "ok" | "failed", detail?: string) => {
    try {
      const { getRuntimeFacade } = await import("./runtime-facade");
      getRuntimeFacade().processRegistry.patchMetadata(watchId, {
        health,
        detail: (detail || health).slice(0, 120),
      });
    } catch {
      /* optional */
    }
  };
  try {
    const { getRuntimeFacade } = await import("./runtime-facade");
    getRuntimeFacade().processRegistry.register({
      id: watchId,
      kind: "agent",
      startedAt: Date.now(),
      label: "script-agent",
      metadata: { watchdog: "true", source: "script-runner-agent", health: "ok" },
    });
  } catch {
    /* facade optional in pure node tests */
  }
  try {
  const timeoutMs = opts.timeoutMs ?? 45 * 60 * 1000;
  const patched: string[] = [];
  let body = opts.scriptBody;

  // Preflight once (java / aapt2 / GRADLE_USER_HOME not on /storage)
  try {
    const pf = await runBuildPreflight();
    if (!pf.ok) {
      const msg = pf.issues.filter((i) => i.severity === "error").map((i) => i.message).join("; ");
      opts.onEvent?.({
        type: "failed",
        attempt: 0,
        state: {
          phase: "unknown",
          category: "preflight",
          fingerprint: "preflight-fail",
          strategy: "fix-java-sdk-aapt2-gradle-home",
          evidence: msg.slice(0, 200),
        },
        logTail: pf.log,
      });
      await markAgentHealth("failed", "preflight");
      return { ok: false, attempts: 0, exitCode: 20, log: `PREFLIGHT_FAILED\n${msg}\n${pf.log}`, patched };
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("warn", "ScriptAgent", `preflight error: ${msg}`);
  }
  let memoryLevel = 0;
  let lastLog = "";
  let lastExit = 1;
  const attemptedStrategies: string[] = [];
  const fingerprints: string[] = [];

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (opts.shouldAbort?.()) {
      opts.onEvent?.({ type: "aborted" });
      try {
        await runShellCommand(buildStopCommand(), { timeoutMs: 15_000 });
      } catch {
        /* ignore */
      }
      await markAgentHealth("failed", "aborted");
      return { ok: false, attempts: attempt, exitCode: lastExit, log: lastLog, patched, aborted: true };
    }

    opts.onEvent?.({ type: "attempt", attempt, maxAttempts });
    persistentLogger.add("info", "ScriptAgent", `attempt ${attempt}/${maxAttempts}`);

    // Перезаписываем .sh на диск (тело могло измениться патчами) — без huge base64 в одной команде
    let scriptPath = opts.scriptPath || AIB_USER_SCRIPT_PATH;
    try {
      scriptPath = await materializeUserScript(body, (cmd, o) =>
        runShellCommand(cmd, { timeoutMs: o?.timeoutMs ?? 20_000 }),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      lastLog = msg;
      lastExit = 9;
      opts.onEvent?.({
        type: "failed",
        attempt,
        state: {
          phase: "unknown",
          category: "script_write",
          fingerprint: "materialize-fail",
          strategy: "rewrite-script-chunks",
          evidence: msg.slice(0, 200),
        },
        logTail: msg,
      });
      continue;
    }

    const preamble = memoryLevel > 0 ? buildMemoryPreamble(memoryLevel) : "";
    const cmd = preamble + buildTermuxLaunchCommand(opts.zipPath, scriptPath);

    let result: TermuxCommandResult;
    try {
      result = await runShellCommand(cmd, { timeoutMs, isBuild: true });
      result = annotateTermuxResult(result, `script-agent-attempt-${attempt}`);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      result = { stdout: "", stderr: msg, exitCode: 1, timedOut: false };
    }

    lastExit = result.exitCode;
    lastLog = logTail(result, 80);
    if (isTermuxNoOutput(result)) {
      persistentLogger.add("error", "ScriptAgent", `TERMUX_NO_OUTPUT attempt=${attempt}`);
    }

    if (opts.shouldAbort?.()) {
      opts.onEvent?.({ type: "aborted" });
      await markAgentHealth("failed", "aborted");
      return { ok: false, attempts: attempt, exitCode: lastExit, log: lastLog, patched, aborted: true };
    }

    if (isSuccess(result)) {
      opts.onEvent?.({ type: "success", attempt, logTail: lastLog });
      await markAgentHealth("ok", "success");
      return { ok: true, attempts: attempt, exitCode: 0, log: lastLog, patched };
    }

    const fullLog = `${result.stdout || ""}\n${result.stderr || ""}`;
    const state = classifyRecoveryFailure(fullLog);
    // Boost category for memory pressure
    if (isMemoryPressureFailure(fullLog)) {
      state.phase = "compile";
      state.category = "memory-pressure-or-process-killed";
      state.strategy =
        "reduce-gradle-heap-and-workers; cleanup-java-processes; optional-daemon-reuse; drop-caches; retry";
      state.evidence = compactEvidence(fullLog);
    }
    if (isNdkCmakeFailure(fullLog)) {
      state.phase = "compile";
      state.category = "ndk-cmake-native";
      state.strategy =
        "export-ANDROID_NDK_HOME; symlink-side-by-side-ndk; write-ndk.dir; retry-configureCMake";
      state.evidence = compactNdkEvidence(fullLog);
    }
    fingerprints.push(state.fingerprint);
    opts.onEvent?.({ type: "failed", attempt, state, logTail: lastLog });

    if (attempt >= maxAttempts) break;

    // --- Deterministic patches (работают и без LLM-агента) ---
    if (isNdkCmakeFailure(fullLog) || state.category === "ndk-cmake-native") {
      const patch = applyNdkPatchesToScript(body);
      body = patch.body;
      patched.push(`ndk: ${patch.description}`);
      attemptedStrategies.push(state.strategy + "|ndk-fix");
      opts.onEvent?.({
        type: "patch",
        attempt,
        description: `NDK/CMake → ${patch.description}`,
      });
      // Also ensure env on device once (outside script)
      try {
        await runShellCommand(
          'NDK=""; for d in "$ANDROID_NDK_HOME" "$PREFIX/opt/android-ndk" "$PREFIX/lib/android-ndk"; do [ -d "$d" ] && NDK="$d" && break; done; ' +
            'SDK="${ANDROID_HOME:-$PREFIX/opt/android-sdk}"; ' +
            'if [ -n "$NDK" ]; then export ANDROID_NDK_HOME="$NDK" ANDROID_NDK_ROOT="$NDK"; mkdir -p "$SDK/ndk"; ' +
            'echo "NDK_ENV_OK $NDK"; else echo NDK_ENV_MISSING; fi',
          { timeoutMs: 20_000 },
        );
      } catch {
        /* best-effort */
      }
      await sleep(1500);
      continue;
    }

    if (isMemoryPressureFailure(fullLog) || state.category.includes("memory")) {
      const patch = applyMemoryPatchesToScript(body, memoryLevel);
      body = patch.body;
      memoryLevel = Math.min(memoryLevel + 1, 2);
      patched.push(`mem[L${memoryLevel}]: ${patch.description}`);
      attemptedStrategies.push(state.strategy + `|memL${memoryLevel}`);
      opts.onEvent?.({
        type: "patch",
        attempt,
        description: `Память/Broken pipe → ${patch.description}`,
      });
      // small pause so Android can reclaim
      await sleep(2500);
      continue;
    }

    // Toolchain / unzip / java missing — DeterministicRepair-aligned shell fixes
    if (state.phase === "toolchain") {
      const logL = fullLog.toLowerCase();
      const cmds: string[] = [];
      if (/java|jdk|javac/.test(logL)) cmds.push("pkg install -y openjdk-17");
      if (/unzip|zip/.test(logL)) cmds.push("pkg install -y unzip");
      if (/gradle/.test(logL)) cmds.push("pkg install -y gradle || true");
      if (/node|npm/.test(logL)) cmds.push("pkg install -y nodejs || true");
      if (!cmds.length) {
        cmds.push("pkg install -y openjdk-17 unzip wget curl 2>/dev/null || true");
      }
      const fixCmd = cmds.join("; ") + "; command -v java; command -v unzip; echo TOOLCHAIN_FIX_DONE";
      try {
        await runShellCommand(fixCmd, { timeoutMs: 180_000 });
        patched.push("toolchain: deterministic pkg install");
        attemptedStrategies.push(state.strategy);
        opts.onEvent?.({ type: "patch", attempt, description: "Deterministic toolchain fix (pkg)" });
        continue;
      } catch {
        /* fall through to LLM */
      }
    }

    // LLM recovery if available
    if (opts.invokeLLM) {
      const prompt = buildLlmRepairContext({
        kind: "script_fix",
        log: lastLog,
        script: body,
        attempt,
        maxLogChars: 6000,
        maxScriptChars: 3500,
      }) +
        "\nIf memory / broken pipe / process killed: lower Xmx, workers=1, parallel=false, pkill Gradle.\n" +
        "Do not rewrite project Gradle version or gradle.properties.\n" +
        buildRecoveryContext(state, attemptedStrategies);
      opts.onEvent?.({ type: "llm", attempt, note: "ИИ анализирует лог и правит окружение…" });
      try {
        const reply = await opts.invokeLLM(prompt);
        let cleaned = String(reply || "")
          .replace(/^```(?:bash|sh)?\n?/i, "")
          .replace(/\n?```$/i, "")
          .trim();
        // If model still answered with agent protocol, peel TERMUX_RUN / heredoc
        const runM = /^TERMUX_RUN:\s*\n?([\s\S]+)/i.exec(cleaned);
        if (runM) cleaned = runM[1].trim();
        const heredoc = /cat\s+>[^<]*<<\s*['"]?(\w+)['"]?\n([\s\S]*?)\n\1\b/i.exec(cleaned);
        if (heredoc?.[2] && heredoc[2].length > 80) cleaned = heredoc[2].trim();
        cleaned = cleaned.replace(/^TERMUX_DONE:[\s\S]*/i, "").trim();
        // Apply returned script if it looks like a real shell script (not pure chat)
        if (
          cleaned.length > 80 &&
          (cleaned.startsWith("#!") ||
            /\bset\s+-[euo]+\b/.test(cleaned) ||
            /\b(gradlew|assemble|unzip|pkg install)\b/i.test(cleaned))
        ) {
          body = cleaned;
          patched.push(`llm-script: ${(cleaned || "").slice(0, 80)}`);
          opts.onEvent?.({
            type: "patch",
            attempt,
            description: `ИИ: подставлен исправленный скрипт (${cleaned.length} симв.)`,
          });
        } else {
          // Advice-only reply: still try memory patch
          const patch = applyMemoryPatchesToScript(body, memoryLevel);
          body = patch.body;
          memoryLevel = Math.min(memoryLevel + 1, 2);
          patched.push(`llm-advice+mem: ${(reply || "").slice(0, 80)}`);
          opts.onEvent?.({
            type: "patch",
            attempt,
            description: `ИИ (совет) + память: ${patch.description}`,
          });
        }
        attemptedStrategies.push(state.strategy + "|llm");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        persistentLogger.add("warn", "ScriptAgent", `LLM recovery failed: ${msg}`);
        // still apply a light memory patch as fallback
        const patch = applyMemoryPatchesToScript(body, memoryLevel);
        body = patch.body;
        memoryLevel = Math.min(memoryLevel + 1, 2);
        patched.push(`fallback-mem: ${patch.description}`);
        opts.onEvent?.({ type: "patch", attempt, description: `Fallback памяти: ${patch.description}` });
      }
      await sleep(1500);
      continue;
    }

    // No LLM: targeted deterministic recovery first, then memory escalation.
    const deterministic = applyDeterministicRecoveryPatches(body, fullLog);
    if (deterministic.description !== "deterministic recovery") {
      body = deterministic.body;
      patched.push(`deterministic: ${deterministic.description}`);
      attemptedStrategies.push(state.strategy + "|deterministic");
      opts.onEvent?.({ type: "patch", attempt, description: deterministic.description });
      await sleep(1200);
      continue;
    }

    const patch = applyMemoryPatchesToScript(body, memoryLevel);
    body = patch.body;
    memoryLevel = Math.min(memoryLevel + 1, 2);
    patched.push(`generic: ${patch.description}`);
    attemptedStrategies.push(state.strategy + "|memory");
    opts.onEvent?.({ type: "patch", attempt, description: patch.description });
    await sleep(2000);
  }

  opts.onEvent?.({ type: "exhausted", logTail: lastLog });
  await markAgentHealth("failed", "exhausted");
  return { ok: false, attempts: maxAttempts, exitCode: lastExit, log: lastLog, patched };
  } finally {
    try {
      const { getRuntimeFacade } = await import("./runtime-facade");
      getRuntimeFacade().processRegistry.unregister(watchId);
    } catch {
      /* ignore */
    }
  }
}

function compactEvidence(log: string): string {
  const lines = log.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const hit =
    lines.find((x) => /broken pipe|out of memory|killed|oom|daemon disappeared/i.test(x)) ||
    lines[lines.length - 1] ||
    "memory-pressure";
  return hit.slice(0, 200);
}

function compactNdkEvidence(log: string): string {
  const lines = log.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  const hit =
    lines.find((x) =>
      /configureCMake|CMake Error|ANDROID_NDK|ndk\.dir|CXX\d+|ninja: error|FAILED/i.test(x),
    ) ||
    lines[lines.length - 1] ||
    "ndk-cmake";
  return hit.slice(0, 220);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
