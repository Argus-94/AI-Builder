/** Hermes-inspired recovery state machine for Android/Termux builds.
 * The goal is not to retry blindly: classify the failure, choose a strategy,
 * remember attempted strategies, and force a different strategy after repeats.
 */
import { getRecoverySkill } from "./agent-skills";

export type RecoveryPhase = "prepare" | "compile" | "dependencies" | "toolchain" | "signing" | "network" | "verification" | "unknown";

export interface RecoveryState {
  phase: RecoveryPhase;
  category: string;
  fingerprint: string;
  strategy: string;
  evidence: string;
}

function compact(text: string): string {
  return text.replace(/\s+/g, " ").trim().slice(0, 360);
}

export function classifyRecoveryFailure(log: string): RecoveryState {
  const t = String(log || "");
  const l = t.toLowerCase();
  let phase: RecoveryPhase = "unknown";
  let category = "unknown-build-failure";
  let strategy = "inspect-root-cause-and-apply-smallest-safe-fix";

  if (/broken pipe|out of memory|outofmemory|java\.lang\.outofmemoryerror|\bood\b|\boom\b|cannot allocate memory|enomem|low memory|memory pressure|daemon disappeared|process .* killed|signal 9|sigkill|gc overhead limit/i.test(l)) {
    phase = "compile";
    category = "memory-pressure-or-process-killed";
    strategy = "reduce-gradle-heap-workers; cleanup-java-processes; optional-daemon-reuse-after-lower-heap; drop-caches; retry";
  } else if (/disk_full|no space left|enospc|not enough space|low_disk/i.test(l)) {
    phase = "prepare";
    category = "disk-space-exhausted";
    strategy = "free-device-storage; clear-gradle-caches-if-safe; report-needed-free-space-to-user; do-not-retry-until-space-available";
  } else if (/unzip_failed|unzip_empty|no_zip|src_not_found|unsafe project zip/i.test(l)) {
    phase = "prepare";
    category = "source-archive-invalid";
    strategy = "verify-zip-path-readable; re-download-or-ask-user-for-valid-zip; refuse-path-traversal-zips";
  } else if (/build_lock_timeout|build_lock_busy/i.test(l)) {
    phase = "compile";
    category = "concurrent-build-lock";
    strategy = "wait-or-clear-stale-lockdir; ensure-single-build; retry";
  } else if (/no_saved_proj/i.test(l)) {
    phase = "prepare";
    category = "project-path-lost";
    strategy = "re-run-prepare-from-src_path; rewrite-proj_path; verify-directory-exists";
  } else if (/no_apk_output|gradle reported success but no apk/i.test(l)) {
    phase = "verification";
    category = "apk-output-missing";
    strategy = "search-build-outputs-recursively; confirm-assemble-task-name; check-productFlavors-output-path; re-run-assemble";
  } else if (/no_verified_gradle_wrapper|no_wrapper_jar|gradle_wrapper_properties_missing|no_wrapper\b/i.test(l)) {
    phase = "toolchain";
    category = "gradle-wrapper-missing";
    strategy = "restore-gradle-wrapper-jar-and-gradlew-from-toolpack; ensure-gradle-wrapper-properties; chmod-gradlew; retry-assemble";
  } else if (/java_missing|error: java missing|no_java\b|java=missing/i.test(l)) {
    phase = "toolchain";
    category = "java-runtime-missing";
    strategy = "pkg-install-openjdk-17; export-JAVA_HOME; verify-java-version; retry";
  } else if (/(apksigner|zipalign|sign_failed|apk_verify)/i.test(t) && !/build successful/i.test(t) && !/unsigned_apk_ok/i.test(l)) {
    phase = "signing";
    category = "apk-signing-or-verification";
    strategy = "inspect-apksigner-zipalign-keystore-and-output-apk; repair-signing-toolchain; verify-v1-v2-v3; allow-unsigned-if-tools-missing";
  } else if (/could not resolve|failed to resolve|could not get resource|failed to download|unknown host|connection refused|connection reset|429|502|503|504|html.*instead of|no cached version/i.test(l)) {
    phase = "network";
    category = "dependency-download-or-network";
    strategy = "inspect-url-and-artifact; validate-content-and-architecture; use-pinned-source-or-cached-verified-artifact; retry-online-without-pipeline-truncation";
  } else if (
    /configurecmake|cmake\s+error|no cmake_android_ndk|unable to locate ndk|externalnativebuild|ninja:\s*error/i.test(l) ||
    (/\[cxx\d+\]/i.test(l) && /ndk|failed/i.test(l))
  ) {
    phase = "compile";
    category = "ndk-cmake-native";
    strategy = "export-ANDROID_NDK_HOME; symlink-side-by-side-ndk; write-ndk.dir; retry-configureCMake";
  } else if (/aapt2|android sdk|sdkmanager|platforms;|build-tools|ndk|clang|java_home|jdk|toolchain|no such file.*sdk|ndk-build/i.test(l)) {
    phase = "toolchain";
    category = "android-toolchain";
    strategy = "inspect-installed-sdk-ndk-java-and-paths; install-only-missing-termux/aarch64-components; verify-command-versions";
  } else if (/expo_cli_missing|node_modules_install_failed|expo_prebuild_failed/i.test(l)) {
    phase = "prepare";
    category = "expo-prebuild-or-cli";
    strategy = "ensure-node-and-deps; locate-expo-cli-under-node_modules; retry-prebuild-with-node-cli; fall-back-npx-expo";
  } else if (/npm|pnpm|yarn|node_modules|package-lock|lockfile|dependency/i.test(l) && /error|failed|could not|missing|not found/i.test(l)) {
    phase = "dependencies";
    category = "javascript-dependencies";
    strategy = "inspect-package-manifest-and-lockfiles; restore-valid-persistent-cache-if-matching; otherwise-install-and-verify";
  } else if (/settings\.gradle|build\.gradle|build\.gradle\.kts|gradle|daemon|plugin|kotlin|unresolved reference|compilation|compile|cannot find symbol|resource.*not found/i.test(l)) {
    phase = "compile";
    category = "gradle-or-source-compilation";
    strategy = "inspect-first-failing-file-and-gradle-context; patch-root-cause; run-targeted-verification-before-full-build";
  } else if (/prepare|prebuild|expo|harden|syntax error|unexpected token/i.test(l)) {
    phase = "prepare";
    category = "project-preparation";
    strategy = "validate-generated-shell-with-bash-n; repair-prebuild/harden-script; rerun-preparation";
  }

  const lines = t.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const evidence = compact(lines.slice(-12).join(" | "));
  const fingerprint = `${phase}|${category}|${compact((lines.find(x => /error|failed|exception|unexpected|not found|could not/i.test(x)) || lines[lines.length - 1] || "failure")).toLowerCase()}`.slice(0, 520);
  return { phase, category, fingerprint, strategy, evidence };
}

export function buildRecoveryContext(state: RecoveryState, attempted: string[]): string {
  const previous = attempted.length
    ? attempted.slice(-6).map((x, i) => `${i + 1}. ${x}`).join("\n")
    : "(none)";
  return (
    `[RECOVERY_STATE]\n` +
    `phase=${state.phase}\ncategory=${state.category}\nfingerprint=${state.fingerprint}\n` +
    `recommended_strategy=${state.strategy}\n` +
    `active_skill=${getRecoverySkill(state.phase)}\n` +
    `evidence=${state.evidence}\n\n` +
    `[PREVIOUS_RECOVERY_STRATEGIES]\n${previous}\n\n` +
    `[RECOVERY_INVARIANT]\n` +
    `Do not repeat a previous strategy unchanged. If the same fingerprint appears again, change the approach: inspect a different layer, make a narrower deterministic patch, or use an already allowlisted pinned source/tool-pack path. Never invent or substitute a source, version, mirror, or package. ` +
    `Do not claim success until a real verification command proves the fix.`
  );
}

export function isRepeatedFailure(state: RecoveryState, fingerprints: string[]): boolean {
  return fingerprints.includes(state.fingerprint);
}
