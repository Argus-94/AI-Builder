import { persistentLogger } from "./persistent-logger";
/**
 * Allowlisted execution of DeterministicRepair recipes via Termux.
 * Only recipes with risk "low" | "medium" may run; high-risk requires explicit confirm.
 * AIB_INTERNAL:* hints are handled in-process (no shell).
 */
import { createDeterministicRepair, type RepairRecipe } from "../core/recovery/DeterministicRepair";
import { getRuntimeFacade } from "./runtime-facade";
import { runShellCommand } from "./termux-bridge";

export type RepairRunResult = Readonly<{
  ok: boolean;
  recipeId: string;
  message: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
}>;

const repair = createDeterministicRepair();

/** Prefer multi-line allowlisted scripts over one-liner hints */
const SCRIPT_BY_RECIPE: Record<string, string> = {
  "java-install": "pkg install -y openjdk-17 && command -v java && java -version 2>&1 | head -1 && echo REPAIR_OK:java",
  "android-tools": "pkg install -y android-tools && command -v adb && echo REPAIR_OK:android-tools",
  "nodejs": "pkg install -y nodejs && node -v && echo REPAIR_OK:nodejs",
  "unzip": "pkg install -y unzip && command -v unzip && echo REPAIR_OK:unzip",
  "proot-distro-pkg": "pkg install -y proot-distro && command -v proot-distro && echo REPAIR_OK:proot-distro",
  "git": "pkg install -y git && git --version && echo REPAIR_OK:git",
  "wget-curl": "pkg install -y wget curl && command -v wget && echo REPAIR_OK:wget",
  "gradle-pkg": "pkg install -y gradle || true; command -v gradle || true; PROJ=$(cat /storage/emulated/0/AIBuilderTermux/.aibuilder/work/proj_path 2>/dev/null); ROOT=\"${PROJ:-}\"; if [ -n \"$ROOT\" ] && [ -d \"$ROOT\" ]; then   mkdir -p \"$ROOT/gradle/wrapper\";   WJAR=\"\"; for c in \"$PREFIX/opt/aibuilder-toolpack/gradle/wrapper/gradle-wrapper.jar\" \"$HOME/.aibuilder/gradle-wrapper.jar\"; do [ -f \"$c\" ] && WJAR=\"$c\" && break; done;   [ -z \"$WJAR\" ] && WJAR=$(find \"$PREFIX\" \"$HOME\" -name gradle-wrapper.jar -type f 2>/dev/null | head -1);   [ -n \"$WJAR\" ] && cp -f \"$WJAR\" \"$ROOT/gradle/wrapper/gradle-wrapper.jar\" && echo wrapper_restored=$WJAR;   if [ ! -f \"$ROOT/gradlew\" ]; then printf '%s\\n' '#!/usr/bin/env bash' 'DIR=$(CDPATH= cd -- \"$(dirname \"$0\")\" && pwd)' 'JAR=\"$DIR/gradle/wrapper/gradle-wrapper.jar\"' 'exec java -classpath \"$JAR\" org.gradle.wrapper.GradleWrapperMain \"$@\"' > \"$ROOT/gradlew\"; chmod 755 \"$ROOT/gradlew\"; fi; fi; echo REPAIR_OK:gradle",
  "home-layout": "mkdir -p \"$HOME/.aibuilder\" \"$HOME/AIBuilderTermux\" \"$HOME/projects\" && echo REPAIR_OK:home-layout",
  "ndk-path": "test -d \"$PREFIX/opt/android-ndk\" && echo REPAIR_OK:ndk || echo NDK_MISSING",
  "aapt2-sdk": "AAPT2=$(command -v aapt2 2>/dev/null || true); [ -z \"$AAPT2\" ] && AAPT2=$(find \"$PREFIX/opt/android-sdk/build-tools\" -name aapt2 -type f 2>/dev/null | tail -1); if [ -n \"$AAPT2\" ]; then chmod +x \"$AAPT2\" 2>/dev/null || true; echo AAPT2_OK=$AAPT2; \"$AAPT2\" version 2>&1 | head -1 || true; echo REPAIR_OK:aapt2; else echo AAPT2_MISSING; command -v sdkmanager >/dev/null 2>&1 && yes | sdkmanager \"build-tools;34.0.0\" 2>&1 | tail -8 || true; AAPT2=$(find \"$PREFIX/opt/android-sdk/build-tools\" -name aapt2 -type f 2>/dev/null | tail -1); [ -n \"$AAPT2\" ] && chmod +x \"$AAPT2\" && echo REPAIR_OK:aapt2 || echo REPAIR_FAIL:aapt2; fi",
  "adb-server": "adb kill-server 2>/dev/null; adb start-server && echo REPAIR_OK:adb-server",
  "local-properties": (
    'SDK=""; for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$PREFIX/opt/android-sdk" "$PREFIX/share/android-sdk"; do ' +
    '[ -n "$d" ] && [ -d "$d/platforms" ] && SDK="$d" && break; done; ' +
    'SDK="${SDK:-$PREFIX/opt/android-sdk}"; ' +
    'PROJ=$(cat /storage/emulated/0/AIBuilderTermux/.aibuilder/work/proj_path 2>/dev/null); ' +
    'for R in "$PROJ" /storage/emulated/0/AIBuilderTermux/* "$PWD"; do ' +
    '[ -n "$R" ] && [ -d "$R" ] && { [ -f "$R/settings.gradle" ] || [ -f "$R/settings.gradle.kts" ] || [ -f "$R/build.gradle" ] || [ -f "$R/build.gradle.kts" ]; } && ' +
    'echo "sdk.dir=$SDK" > "$R/local.properties" && echo "REPAIR_OK:local-properties path=$R sdk=$SDK" && exit 0; done; ' +
    'echo "sdk.dir=$SDK" > local.properties; echo "REPAIR_OK:local-properties cwd sdk=$SDK"'
  ),
  "gradle-wrapper": (
    'PROJ=$(cat /storage/emulated/0/AIBuilderTermux/.aibuilder/work/proj_path 2>/dev/null); ' +
    'ROOT="${PROJ:-$PWD}"; cd "$ROOT" || exit 1; mkdir -p gradle/wrapper; ' +
    'WJAR=""; for c in "$PREFIX/opt/aibuilder-toolpack/gradle/wrapper/gradle-wrapper.jar" "$HOME/.aibuilder/gradle-wrapper.jar"; do ' +
    '[ -f "$c" ] && WJAR="$c" && break; done; ' +
    '[ -z "$WJAR" ] && WJAR=$(find "$PREFIX" "$HOME" -name gradle-wrapper.jar -type f 2>/dev/null | head -1); ' +
    'if [ -n "$WJAR" ]; then cp -f "$WJAR" gradle/wrapper/gradle-wrapper.jar; echo "wrapper_restored=$WJAR"; ' +
    'elif command -v gradle >/dev/null 2>&1; then gradle wrapper --gradle-version 8.2 2>&1 | tail -20; fi; ' +
    'test -f gradle/wrapper/gradle-wrapper.jar && echo REPAIR_OK:gradle-wrapper || echo REPAIR_FAIL:gradle-wrapper'
  ),
};

/** Health rule id → DeterministicRepair recipe id */
const DIAG_TO_RECIPE: Record<string, string> = {
  "toolchain.java": "java-install",
  "toolchain.gradle": "gradle-pkg",
  "toolchain.node": "nodejs",
  "toolchain.android-sdk": "android-tools",
  "device.adb": "android-tools",
  "runtime.proot": "proot-distro-pkg",
  "runtime.termux-session": "journal-recovery",
  "runtime.userspace": "proot-distro-pkg",
  "runtime.disk": "journal-recovery",
  "toolchain.git": "git",
  "toolchain.unzip": "unzip",
  "runtime.debian": "proot-distro-pkg",
  "runtime.home-layout": "home-layout",
  "toolchain.ndk": "ndk-path",
  "toolchain.aapt2": "aapt2-sdk",
};

/** Recipes safe to auto-run from Health "Repair all" without extra confirm. */
const AUTO_ALLOW = new Set([
  "journal-recovery",
  "local-properties",
  "gradle-wrapper",
  "android-tools",
  "nodejs",
  "proot-distro-pkg",
  "unzip",
  "git",
  "wget-curl",
  "java-install",
  "home-layout",
  "ndk-path",
  "aapt2-sdk",
  "adb-server",
]);

export function listRepairRecipes(): RepairRecipe[] {
  return repair.list();
}

export function getRepairRecipe(id: string): RepairRecipe | undefined {
  return repair.get(id);
}

/**
 * Run a single recipe. Internal handlers first, then allowlisted shell hint.
 */
export async function runRepairRecipe(
  id: string,
  options?: { allowMedium?: boolean; force?: boolean },
): Promise<RepairRunResult> {
  persistentLogger.add("info", "Repair", `recipe=${id}`);
  const recipe = repair.get(id);
  if (!recipe) {
    return { ok: false, recipeId: id, message: `Unknown recipe: ${id}` };
  }

  if (recipe.risk === "high" && !options?.force) {
    return {
      ok: false,
      recipeId: id,
      message: `Recipe ${id} is high-risk; pass force:true after user confirm`,
    };
  }
  if (recipe.risk === "medium" && !options?.allowMedium && !options?.force && !AUTO_ALLOW.has(id)) {
    return {
      ok: false,
      recipeId: id,
      message: `Recipe ${id} is medium-risk; enable allowMedium or force`,
    };
  }

  // In-process handlers
  if (recipe.termuxHint.startsWith("AIB_INTERNAL:")) {
    const internal = recipe.termuxHint.slice("AIB_INTERNAL:".length).trim();
    if (internal === "journal-recover") {
      try {
        const r = await getRuntimeFacade().recoverPendingTransactions();
        return {
          ok: true,
          recipeId: id,
          message: `Journal recovery: recovered=${r.recovered} failed=${r.failed}`,
        };
      } catch (e) {
        return {
          ok: false,
          recipeId: id,
          message: e instanceof Error ? e.message : String(e),
        };
      }
    }
    return { ok: false, recipeId: id, message: `Unknown internal handler: ${internal}` };
  }

  // Shell allowlist: only the exact termuxHint string from the recipe catalog
  const script = SCRIPT_BY_RECIPE[id];
  const cmd = script || recipe.termuxHint;
  if (!cmd || (!script && (cmd.includes("\n") || cmd.length > 500))) {
    return { ok: false, recipeId: id, message: "Recipe shell hint rejected by allowlist" };
  }

  try {
    const result = await runShellCommand(cmd, { timeoutMs: 300_000 });
    const exitCode = result.exitCode ?? result.code ?? 1;
    return {
      ok: exitCode === 0,
      recipeId: id,
      message: exitCode === 0 ? `Recipe ${id} OK` : `Recipe ${id} exit=${exitCode}`,
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode,
    };
  } catch (e) {
    return {
      ok: false,
      recipeId: id,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Map diagnostic rule id → run matching recipe if any. */
export async function runRepairForDiagnostic(
  diagnosticId: string,
  options?: { allowMedium?: boolean },
): Promise<RepairRunResult> {
  persistentLogger.add("info", "Repair", `start id=${diagnosticId}`);
  const recipe = repair.forDiagnostic(diagnosticId);
  if (!recipe) {
    return { ok: false, recipeId: diagnosticId, message: `No recipe for diagnostic ${diagnosticId}` };
  }
  return runRepairRecipe(recipe.id, options);
}
