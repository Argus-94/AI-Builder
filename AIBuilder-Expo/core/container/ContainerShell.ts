/**
 * Unified container shell API for Ubuntu / Kali profiles.
 * Runtime-only; does not own projects.
 */

import type { HomeLayout } from "../home/HomeLayout";
import {
  buildUbuntuShellSpec,
  describeUbuntuShell,
  type UbuntuShellSpec,
} from "../ubuntu/UbuntuShell";
import {
  buildKaliShellSpec,
  describeKaliShell,
  type KaliShellSpec,
} from "./KaliShell";

export type ContainerProfile = "ubuntu" | "kali";

export type ContainerShellSpec = {
  profile: ContainerProfile;
  instanceId: string;
  projectRoot: string;
  containerCwd: string;
  env: Record<string, string>;
  shellCommand: string;
};

export function buildContainerShellSpec(
  home: HomeLayout,
  profile: ContainerProfile,
  input: { instanceId: string; projectId: string; projectRoot?: string },
): ContainerShellSpec {
  if (profile === "ubuntu") {
    const s: UbuntuShellSpec = buildUbuntuShellSpec(home, input);
    return { profile, ...s };
  }
  const s: KaliShellSpec = buildKaliShellSpec(home, input);
  return { profile, ...s };
}

export function describeContainerShell(spec: ContainerShellSpec): string {
  if (spec.profile === "ubuntu") {
    return describeUbuntuShell(spec);
  }
  return describeKaliShell(spec);
}
