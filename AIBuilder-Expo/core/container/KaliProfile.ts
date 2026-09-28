/**
 * Kali as another ContainerManager profile (runtime-only).
 */

import type { ContainerImage } from "./ContainerTypes";
import type { HomeLayout } from "../home/HomeLayout";

export const KALI_IMAGE_ID = "kali:base";
export const KALI_IMAGE_NAME = "Kali";
export const KALI_IMAGE_TAG = "base";

export function kaliImageManifest(home: HomeLayout): ContainerImage {
  return {
    id: KALI_IMAGE_ID,
    name: KALI_IMAGE_NAME,
    tag: KALI_IMAGE_TAG,
    profile: "kali",
    path: `${home.containersKali}/images/base`,
    createdAt: Date.now(),
  };
}
