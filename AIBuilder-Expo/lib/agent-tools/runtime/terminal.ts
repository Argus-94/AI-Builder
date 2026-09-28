import { getRuntimeFacade } from "../../runtime-facade";
import type { ToolArgs } from "../types";

export function validate(args: ToolArgs): string | null {
  if (typeof args.projectId !== "string" || !args.projectId.trim()) {
    return "PROJECT_ID_REQUIRED";
  }
  return null;
}

export async function execute(args: ToolArgs) {
  const projectId = String(args.projectId);
  const session = await getRuntimeFacade().openTerminalForProject(projectId);
  return { terminalSessionId: session.id, cwd: session.cwd, home: session.home };
}
