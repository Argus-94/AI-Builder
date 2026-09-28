/**
 * Agent tool: build.run
 *
 * Lives at lib/agent-tools/build-run.ts (flat — not under build/).
 * Relative paths are one level shallower than tools under fs/, ast/, etc.
 *
 * Runs a project build / Gradle / SDK command through the central Termux
 * executor. Dependency mutations (npm/yarn/pnpm/bun add|install without
 * --frozen-lockfile) are rejected at validate-time.
 */
import { executeGuardedTermuxCommand } from "../termux-executor";
import { dependencyMutationError, isNonEmptyString } from "./common";
import type { ToolArgs } from "./types";

export function validate(args: ToolArgs): string | null {
  const command = args.command;
  if (!isNonEmptyString(command)) return "BUILD_COMMAND_REQUIRED";
  const mutation = dependencyMutationError(String(command));
  if (mutation) return mutation;
  return null;
}

export function execute(args: ToolArgs, projectPath?: string | null) {
  const command = String(args.command ?? "").trim();
  const mutation = dependencyMutationError(command);
  if (mutation) {
    return Promise.reject(new Error(mutation));
  }
  const isHeavy =
    /assemble|gradlew|gradle\s|bundle|aab|prebuild|expo\s+export/i.test(command);
  const defaultMs = isHeavy ? 600_000 : 180_000;
  const maxMs = isHeavy ? 1_200_000 : 600_000;
  return executeGuardedTermuxCommand(command, {
    workdir: projectPath || undefined,
    timeoutMs: Math.min(Math.max(Number(args.timeoutMs) || defaultMs, 30_000), maxMs),
    isBuild: true,
  });
}
