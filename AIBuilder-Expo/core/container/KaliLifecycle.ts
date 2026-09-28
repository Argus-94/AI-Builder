/**
 * Kali container lifecycle (parallel to Ubuntu).
 * Same rule: containers do not own projects.
 */

import type { UserspaceContainerBackend } from "./UserspaceContainerBackend";
import type { ContainerInstance } from "./ContainerTypes";
import { KALI_IMAGE_ID } from "./KaliProfile";
import { projectWorkspaceMount } from "../ubuntu/UbuntuProfile";
import type { HomeLayout } from "../home/HomeLayout";

export async function launchKaliForProject(
  backend: UserspaceContainerBackend,
  _home: HomeLayout,
  options: {
    name?: string;
    projectId: string;
    projectRoot: string;
  },
): Promise<ContainerInstance> {
  const instance = await backend.create({
    imageId: KALI_IMAGE_ID,
    name: options.name ?? `kali-${options.projectId}`,
    mounts: [projectWorkspaceMount(options.projectRoot)],
    policy: "PROJECT_ONLY",
    projectId: options.projectId,
  });
  await backend.start(instance.id);
  return backend.get(instance.id)!;
}
