/**
 * Read-only toolchain diagnostics for UI / agent reports.
 */

import type { ToolchainManager } from "./ToolchainManager";
import type { ToolchainManifest } from "./ToolchainManifest";

export type ToolchainDiagnosticsReport = {
  available: number;
  healthy: number;
  missingKinds: string[];
  items: Array<{
    id: string;
    kind: string;
    name: string;
    version?: string;
    path?: string;
    health: string;
  }>;
  generatedAt: number;
};

export function buildToolchainDiagnostics(
  manager: ToolchainManager,
  expectedKinds: string[] = ["android-sdk", "java", "node", "python", "git"],
): ToolchainDiagnosticsReport {
  const diag = manager.diagnostics();
  const items = diag.items.map((m: ToolchainManifest) => ({
    id: m.id,
    kind: m.kind,
    name: m.name,
    version: m.version,
    path: m.path,
    health: m.health,
  }));
  const present = new Set(items.map((i) => i.kind));
  const missingKinds = expectedKinds.filter((k) => !present.has(k));
  const healthy = items.filter((i) => i.health === "healthy").length;

  return {
    available: diag.available,
    healthy,
    missingKinds,
    items,
    generatedAt: Date.now(),
  };
}
