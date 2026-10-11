import { getRuntimeFacade } from "../../runtime-facade";
import { snapshotRuntimeStatus } from "../../../core/RuntimeStatus";
import type { ToolArgs } from "../types";

export function validate(_args: ToolArgs): string | null {
  return null;
}

export async function execute(_args: ToolArgs) {
  const facade = getRuntimeFacade();
  return snapshotRuntimeStatus(facade);
}
