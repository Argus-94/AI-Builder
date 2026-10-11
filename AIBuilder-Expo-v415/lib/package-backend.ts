import { withInstallerEnvironment, withCheckEnvironment } from "./termux-installer-env";
import { getBuildBackend, type AgentShellBackend } from "./agent-shell-backend";
import { executeGuardedTermuxCommand } from "./termux-executor";
import type { TermuxCommandResult } from "./termux-bridge";
import {
  adaptPackageCommandForBackend,
  isPackageSupportedOnBackend,
  packageBackendTarget,
  type PackageBackendTarget,
  type PackageCommandKind,
} from "./package-command-routing";
import { routeRuntimeCommand } from "./runtime-command-routing";

export type { PackageBackendTarget, PackageCommandKind } from "./package-command-routing";

/** Convert the legacy catalog for the selected runtime, or explicitly for host Termux. */
export function adaptPackageCommand(command: string, kind: PackageCommandKind, forceHost = false): string {
  const selected = getBuildBackend();
  const target = forceHost ? "termux" : packageBackendTarget(selected);
  return adaptPackageCommandForBackend(command, kind, target);
}

export async function runPackageCommand(
  command: string,
  options: { timeoutMs?: number; isBuild?: boolean; honorExplicitTimeout?: boolean; kind: PackageCommandKind; packageId?: string; selectedBackend?: AgentShellBackend; traceId?: string },
): Promise<TermuxCommandResult> {
  const selectedBackend = options.selectedBackend ?? getBuildBackend();
  const targetBackend = packageBackendTarget(selectedBackend, options.packageId);
  const executionBackend = routeRuntimeCommand(selectedBackend, "package", options.packageId);

  if (!isPackageSupportedOnBackend(options.packageId, targetBackend)) {
    throw new Error(
      `PACKAGE_UNSUPPORTED_IN_${selectedBackend === "ubuntu-proot" ? "UBUNTU" : "TERMUX"}: android-ndk uses a Termux-aarch64 toolchain; select Termux backend for NDK installation`,
    );
  }

  // Route first, then build environment wrappers. This prevents a host-only
  // bootstrap from receiving a Linux apt wrapper before being forced to Termux.
  const adapted = adaptPackageCommandForBackend(command, options.kind, targetBackend);
  const prepared = options.kind === "check"
    ? withCheckEnvironment(adapted, targetBackend)
    : withInstallerEnvironment(adapted, targetBackend);

  return executeGuardedTermuxCommand(prepared, {
    timeoutMs: options.timeoutMs,
    isBuild: options.isBuild,
    honorExplicitTimeout: options.honorExplicitTimeout,
    trustedInternal: true,
    hostTermux: executionBackend === "termux",
    backend: executionBackend,
    traceId: options.traceId,
  });
}
