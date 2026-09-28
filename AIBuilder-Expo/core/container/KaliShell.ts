/**
 * Kali shell environment helper (parity with UbuntuShell).
 * Projects remain under AIBuilderTermux HOME; containers do not own them.
 */

import type { HomeLayout } from "../home/HomeLayout";

export type KaliShellSpec = {
  instanceId: string;
  projectRoot: string;
  containerCwd: string;
  env: Record<string, string>;
  shellCommand: string;
};

export function buildKaliShellSpec(
  home: HomeLayout,
  input: { instanceId: string; projectId: string; projectRoot?: string },
): KaliShellSpec {
  const projectRoot =
    input.projectRoot ?? `${home.projects}/${input.projectId}`;
  const storage = `${home.containers}/instances/${input.instanceId}`;
  return {
    instanceId: input.instanceId,
    projectRoot,
    containerCwd: "/workspace",
    env: {
      HOME: "/root",
      PWD: "/workspace",
      PROJECT_ROOT: "/workspace",
      AI_BUILDER_HOME: home.root,
      AI_BUILDER_PROJECT: projectRoot,
      AIB_CONTAINER_STORAGE: storage,
      AIB_CONTAINER_PROFILE: "kali",
    },
    shellCommand: "bash -l",
  };
}

export function describeKaliShell(spec: KaliShellSpec): string {
  return `kali[${spec.instanceId}] cwd=${spec.containerCwd} project=${spec.projectRoot} shell=${spec.shellCommand}`;
}
