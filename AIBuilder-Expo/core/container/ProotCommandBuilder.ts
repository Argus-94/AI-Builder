/**
 * Builds proot-oriented launch command lines from ContainerShellSpec.
 * Does not execute; backends consume the string when proot is available.
 * Runtime-only; projects stay on host under AIBuilderTermux HOME.
 */

import type { ContainerShellSpec } from "./ContainerShell";

export type ProotLaunchPlan = {
  /** Full shell command suitable for Termux/proot wrapper */
  command: string;
  /** Environment to export before launch */
  env: Record<string, string>;
  /** Host path that must remain mounted (project) */
  projectRoot: string;
  profile: ContainerShellSpec["profile"];
  instanceId: string;
};

/**
 * Construct a conservative proot launch plan.
 * When rootfs is not present, command is a no-op diagnostic echo.
 */
export function buildProotLaunchPlan(
  spec: ContainerShellSpec,
  options?: {
    rootfsPath?: string;
    prootBinary?: string;
    extraBinds?: Array<{ host: string; guest: string }>;
  },
): ProotLaunchPlan {
  const proot = options?.prootBinary ?? "proot";
  const rootfs = options?.rootfsPath;
  const binds = [
    { host: spec.projectRoot, guest: "/workspace" },
    ...(options?.extraBinds ?? []),
  ];

  if (!rootfs) {
    return {
      command: `echo "AIB_PROOT_ROOTFS_MISSING profile=${spec.profile} instance=${spec.instanceId}"`,
      env: { ...spec.env },
      projectRoot: spec.projectRoot,
      profile: spec.profile,
      instanceId: spec.instanceId,
    };
  }

  const bindArgs = binds
    .map((b) => `-b ${JSON.stringify(b.host)}:${b.guest}`)
    .join(" ");
  const envExports = Object.entries(spec.env)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(" ");

  const command = [
    envExports,
    proot,
    "-0",
    `-r ${JSON.stringify(rootfs)}`,
    bindArgs,
    `-w ${JSON.stringify(spec.containerCwd)}`,
    "--",
    spec.shellCommand,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    command,
    env: { ...spec.env },
    projectRoot: spec.projectRoot,
    profile: spec.profile,
    instanceId: spec.instanceId,
  };
}
