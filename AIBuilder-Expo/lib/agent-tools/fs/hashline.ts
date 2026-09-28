import { executeGuardedTermuxCommand } from "../../termux-executor";
import { quote, safePath } from "../common";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null {
  const path = String(args.path || "");
  if (!path.trim()) return "PATH_REQUIRED";
  if (path.includes("\0") || path.startsWith("/") || path.split(/[\\/]/).includes("..")) return "PATH_NOT_ALLOWED";
  return null;
}
export function execute(args: ToolArgs, projectPath?: string | null) {
  const path = safePath(String(args.path ?? ""));
  return executeGuardedTermuxCommand(`node scripts/aib-hashline.mjs read ${quote(path)} ${Number(args.start || 1)} ${Number(args.end || 120)}`, {
    workdir: projectPath || undefined, timeoutMs: 30_000,
  });
}
