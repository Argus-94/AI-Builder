import { executeGuardedTermuxCommand } from "../../termux-executor";
import { quote, safePath } from "../common";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null {
  const path = String(args.path || "");
  if (!path.trim()) return "PATH_REQUIRED";
  if (path.includes("\0") || path.startsWith("/") || path.split(/[\\/]/).includes("..")) return "PATH_NOT_ALLOWED";
  if (!args.hashStart || !args.hashEnd) return "HASH_REQUIRED";
  if (!Number.isInteger(Number(args.start)) || !Number.isInteger(Number(args.end)) || Number(args.start) < 1 || Number(args.end) < Number(args.start) || typeof args.replacement !== "string") return "REPLACE_RANGE_ARGS_INVALID";
  return null;
}
export function execute(args: ToolArgs, projectPath?: string | null) {
  const path = safePath(String(args.path ?? ""));
  return executeGuardedTermuxCommand(`node scripts/aib-hashline.mjs replace-range ${quote(path)} ${Number(args.start)} ${Number(args.end)} ${quote(String(args.hashStart))} ${quote(String(args.hashEnd))} ${quote(String(args.replacement ?? ""))}`, {
    workdir: projectPath || undefined, timeoutMs: 30_000,
  });
}
