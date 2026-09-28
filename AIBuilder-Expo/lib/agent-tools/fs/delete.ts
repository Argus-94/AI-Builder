import { executeGuardedTermuxCommand } from "../../termux-executor";
import { quote, safePath } from "../common";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null {
  const path = String(args.path || "");
  if (!path.trim()) return "PATH_REQUIRED";
  if (path.includes("\0") || path.startsWith("/") || path.split(/[\\/]/).includes("..")) return "PATH_NOT_ALLOWED";
  if (!/^[a-f0-9]{64}$/i.test(String(args.sha256 || ""))) return "SHA256_REQUIRED";
  return null;
}
export function execute(args: ToolArgs, projectPath?: string | null) {
  const path = safePath(String(args.path ?? ""));
  return executeGuardedTermuxCommand(`node scripts/aib-hashline.mjs delete ${quote(path)} ${quote(String(args.sha256))}`, {
    workdir: projectPath || undefined, timeoutMs: 30_000,
  });
}
