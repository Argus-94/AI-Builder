import { runShellCommand, type TermuxCommandResult } from "./termux-bridge";
import { guardTermuxCommand, guardReadOnlyTermuxCommand } from "./termux-guard";
import { assertCommandAllowed } from "./security-policy";
import { compressShellOutput } from "./context-engine";

export interface GuardedTermuxOptions {
  workdir?: string;
  timeoutMs?: number;
  isBuild?: boolean;
  allowDangerous?: boolean;
  confirmDangerous?: (command: string, reason: string) => Promise<boolean>;
  /** App-defined trusted maintenance commands (never model-generated). */
  trustedInternal?: boolean;
}

/**
 * Single policy boundary for model-originated shell execution.
 * Callers must use this wrapper instead of invoking runShellCommand directly.
 */
/** Rewrite absolute Termux PREFIX paths so policy does not treat them as foreign /data/data. */
function normalizeTermuxCommandPaths(command: string): string {
  let c = String(command || "");
  // Common absolute PREFIX → $PREFIX (safe in Termux shell)
  c = c.replace(/\/data\/data\/com\.termux\/files\/usr\b/g, "$PREFIX");
  c = c.replace(/\/data\/data\/com\.termux\/files\/home\b/g, "$HOME");
  // JAVA_HOME under openjdk packages
  c = c.replace(
    /\/data\/data\/com\.termux\/files\/usr\/(?:lib\/jvm|share)\/[^\s"']+/g,
    (m) => m.replace("/data/data/com.termux/files/usr", "$PREFIX"),
  );
  return c;
}

export async function executeGuardedTermuxCommand(
  command: string,
  options: GuardedTermuxOptions = {},
): Promise<TermuxCommandResult> {
  const commandNorm = normalizeTermuxCommandPaths(command);
  const guard = guardTermuxCommand(commandNorm, {
    allowDangerous: options.allowDangerous,
    projectPath: options.workdir,
  });

  if ("reason" in guard) {
    const reason = guard.reason;
    // Trusted internal maintenance commands are authored by the app itself
    // (for example verified tool-pack installers). They may use shell
    // constructs such as $() for deterministic path discovery, but they must
    // still obey the hard-block rules enforced above. Model-originated
    // commands never set trustedInternal.
    if (!(options.trustedInternal === true && guard.confirmable === true)) {
      let allowed = false;
      if (guard.confirmable === true && options.confirmDangerous) {
        try {
          allowed = await options.confirmDangerous(commandNorm, reason);
        } catch {
          allowed = false;
        }
      }
      if (!allowed) {
        throw new Error(`BLOCKED_BY_APP: ${reason}`);
      }
    }
  }

  assertCommandAllowed(commandNorm, "termux", { interactive: false });
  const result = await runShellCommand(commandNorm, {
    workdir: options.workdir,
    timeoutMs: options.timeoutMs,
    isBuild: options.isBuild,
  });
  try {
    // Never compress trusted/build pipeline output — markers APK_PATH/SIGNED_*/AAB_OK/gradle_ec must survive
    if (
      result &&
      typeof result === "object" &&
      options.trustedInternal !== true &&
      options.isBuild !== true
    ) {
      const r = result as { stdout?: string; stderr?: string };
      if (typeof r.stdout === "string" && r.stdout.length > 1500) {
        const hasMarkers =
          /APK_PATH=|SIGNED_V1_V2_V3_OK|UNSIGNED_APK_OK|AAB_OK=|gradle_ec=|PREPARE_OK/.test(
            r.stdout,
          );
        if (!hasMarkers) {
          r.stdout = compressShellOutput(
            r.stdout,
            typeof r.stderr === "string" ? r.stderr : "",
          );
        }
      }
    }
  } catch {
    /* compression is best-effort */
  }
  return result;
}


/** Execute a command under the strict subagent read-only policy. */
export async function executeReadOnlyTermuxCommand(
  command: string,
  options: Pick<GuardedTermuxOptions, "workdir" | "timeoutMs"> = {},
): Promise<TermuxCommandResult> {
  const guard = guardReadOnlyTermuxCommand(command);
  if ("reason" in guard) {
    throw new Error(`BLOCKED_READ_ONLY_SUBAGENT: ${guard.reason}`);
  }
  assertCommandAllowed(command, "termux", { interactive: false });
  return runShellCommand(command, {
    workdir: options.workdir,
    timeoutMs: options.timeoutMs,
  });
}
