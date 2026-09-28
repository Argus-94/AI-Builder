/**
 * Read-only Android SDK discovery.
 *
 * Locates an existing SDK under common locations or AIBuilderTermux HOME/sdk.
 * Never writes local.properties, never changes project compileSdk/targetSdk.
 */

import type { ToolchainManifest } from "./ToolchainManifest";
import { createToolchainManifest } from "./ToolchainManifest";

export type PathProbe = {
  exists: (path: string) => Promise<boolean> | boolean;
  isDirectory?: (path: string) => Promise<boolean> | boolean;
  readText?: (path: string) => Promise<string> | string;
};

const COMMON_SDK_CANDIDATES = [
  "/storage/emulated/0/Android/Sdk",
  "/sdcard/Android/Sdk",
  "/data/data/com.termux/files/home/android-sdk",
  "/usr/lib/android-sdk",
];

export async function discoverAndroidSdk(
  probe: PathProbe,
  options?: {
    homeSdkPath?: string;
    extraCandidates?: string[];
  },
): Promise<ToolchainManifest[]> {
  const candidates = [
    ...(options?.homeSdkPath ? [options.homeSdkPath] : []),
    ...(options?.extraCandidates ?? []),
    ...COMMON_SDK_CANDIDATES,
  ];

  const results: ToolchainManifest[] = [];
  const seen = new Set<string>();

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);
    const exists = await probe.exists(candidate);
    if (!exists) continue;

    let version: string | undefined;
    if (probe.readText) {
      try {
        const sourceProps = await probe.readText(
          `${candidate.replace(/\/$/, "")}/source.properties`,
        );
        const match = /Pkg\.Revision\s*=\s*([^\r\n]+)/.exec(sourceProps);
        if (match) version = match[1].trim();
      } catch {
        // ignore
      }
    }

    results.push(
      createToolchainManifest({
        id: `android-sdk:${candidate}`,
        kind: "android-sdk",
        name: "Android SDK",
        path: candidate,
        home: candidate,
        version,
        health: "healthy",
        metadata: { discovery: "read-only" },
      }),
    );
  }

  return results;
}
