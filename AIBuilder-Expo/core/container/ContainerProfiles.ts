import type { ContainerImage } from "./ContainerTypes";

export const DEBIAN_IMAGE: ContainerImage = {
  id: "debian:stable", name: "Debian", tag: "stable", profile: "ubuntu", createdAt: 0,
};
export const UBUNTU_IMAGE: ContainerImage = {
  id: "ubuntu:24.04", name: "Ubuntu", tag: "24.04", profile: "ubuntu", createdAt: 0,
};
