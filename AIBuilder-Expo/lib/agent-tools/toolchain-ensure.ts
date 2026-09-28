/**
 * Agent tool: toolchain.ensure
 * Installs/verifies Java + Gradle + basic Android SDK layout in Termux.
 */
import { ensureAndroidToolchain } from "../agent-engine";
import type { ToolArgs } from "./types";

export function validate(_args: ToolArgs): string | null {
  return null;
}

export async function execute(args: ToolArgs, _projectPath?: string | null) {
  const timeoutMs = Math.min(Math.max(Number(args.timeoutMs) || 600_000, 60_000), 900_000);
  const result = await ensureAndroidToolchain(timeoutMs);
  return {
    ok: result.ok,
    log: result.log,
    exitCode: result.ok ? 0 : 1,
  };
}
