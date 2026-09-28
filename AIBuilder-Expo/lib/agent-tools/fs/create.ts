import { executeGuardedTermuxCommand } from "../../termux-executor";
import { utf8ToBase64 } from "../../base64";
import { quote, safePath } from "../common";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null {
  const path = String(args.path || "");
  if (!path.trim()) return "PATH_REQUIRED";
  if (path.includes("\0") || path.startsWith("/") || path.split(/[\\/]/).includes("..")) return "PATH_NOT_ALLOWED";
  if (typeof args.content !== "string" || args.content.length > 500_000) return "CONTENT_REQUIRED_OR_TOO_LARGE";
  return null;
}
export function execute(args: ToolArgs, projectPath?: string | null) {
  const path = safePath(String(args.path ?? ""));
  const encoded = utf8ToBase64(String(args.content ?? ""));
  return executeGuardedTermuxCommand(`node scripts/aib-hashline.mjs create ${quote(path)} ${quote(encoded)}`, {
    workdir: projectPath || undefined, timeoutMs: 30_000,
  });
}
