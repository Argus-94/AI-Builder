import { errorMessage } from "./error-utils";
import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { persistentLogger } from "./persistent-logger";
import { getTermuxNative } from "./termux-bridge";

export type AddonId = "termux" | "shizuku" | "termuxBoot";

export interface AddonStatus {
  installed: boolean;
  version: string | null;
}

interface AddonSource {
  packageName: string;
  version: string;
  assetName: string;
  expectedSha256: string;
  downloadUrl: string;
  fallbackPage: string;
}

const SOURCES: Record<AddonId, AddonSource> = {
  termux: {
    packageName: "com.termux",
    version: "0.118.3",
    assetName: "com.termux_1002.apk",
    expectedSha256: "e6265a57eb5ca363808488e3b01955958bed93bc0c8a0d281849b363b11027ec",
    downloadUrl: "https://f-droid.org/repo/com.termux_1002.apk",
    fallbackPage: "https://f-droid.org/packages/com.termux/",
  },
  shizuku: {
    packageName: "moe.shizuku.privileged.api",
    version: "v13.6.0",
    assetName: "shizuku-v13.6.0.r1086.2650830c-release.apk",
    expectedSha256: "6e273ab0e991c4e79bc8b1bbb9b9dd739ccac1a8712a541a214078886b7b790f",
    downloadUrl: "https://github.com/RikkaApps/Shizuku/releases/download/v13.6.0/shizuku-v13.6.0.r1086.2650830c-release.apk",
    fallbackPage: "https://github.com/RikkaApps/Shizuku/releases/tag/v13.6.0",
  },
  termuxBoot: {
    packageName: "com.termux.boot",
    version: "0.8.1",
    assetName: "com.termux.boot_1000.apk",
    expectedSha256: "6f7cf9b94f539d3efd4af3544ff819947b49395275d8cfa7e5f80de14f3d9cf8",
    downloadUrl: "https://f-droid.org/repo/com.termux.boot_1000.apk",
    fallbackPage: "https://f-droid.org/packages/com.termux.boot/",
  },
};

/** Current resumable download (if any) — for cancelAddonDownload(). */
let activeAddonDownload: ReturnType<typeof FileSystem.createDownloadResumable> | null = null;

function native() {
  return getTermuxNative();
}

export async function getSupportedAbis(): Promise<string[]> {
  if (Platform.OS !== "android") return [];
  const n = native();
  if (!n?.getSupportedAbis) return [];
  return n.getSupportedAbis().catch(() => []);
}

export async function getAddonStatus(id: AddonId): Promise<AddonStatus> {
  const n = native();
  if (!n?.getPackageVersion) return { installed: false, version: null };
  const version = await n.getPackageVersion(SOURCES[id].packageName).catch(() => null);
  return { installed: !!version, version };
}

export async function canInstallPackages(): Promise<boolean> {
  if (Platform.OS !== "android") return false;
  const n = native();
  return !!(n?.canInstallPackages && await n.canInstallPackages().catch(() => false));
}

export async function openUnknownSourcesSettings(): Promise<boolean> {
  const n = native();
  if (!n?.openUnknownSourcesSettings) return false;
  return n.openUnknownSourcesSettings().catch(() => false);
}

function abiTokens(abis: string[]): string[] {
  const normalized = abis.map((x) => x.toLowerCase());
  const preferred = normalized.find((x) => ["arm64-v8a", "armeabi-v7a", "x86_64", "x86"].includes(x));
  return preferred ? [preferred] : normalized;
}

function resolveSource(id: AddonId) {
  const source = SOURCES[id];
  if (!/^https:\/\//.test(source.downloadUrl)) throw new Error("ADDON_SOURCE_HTTPS_REQUIRED");
  if (!/^[a-f0-9]{64}$/.test(source.expectedSha256)) throw new Error("ADDON_STATIC_SHA256_REQUIRED");
  return source;
}

/** Скачивает APK дополнения. Системный установщик НЕ запускается. */
export async function downloadAddon(
  id: AddonId,
  onProgress?: (progress: number) => void,
): Promise<{ version: string; assetName: string; uri: string }> {
  if (Platform.OS !== "android") throw new Error("Установка дополнений поддерживается только на Android.");
  const n = native();
  if (!n?.installApk) throw new Error("Нативный установщик APK недоступен. Нужна новая Android-сборка.");

  const abis = await getSupportedAbis();
  persistentLogger.markAppEvent("TERMUX_ADDON_ARCH", { addon: id, abis });
  const source = resolveSource(id);
  const safeName = source.assetName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const target = `${FileSystem.cacheDirectory}aib-addon-${id}-${Date.now()}-${safeName}`;
  persistentLogger.markAppEvent("TERMUX_ADDON_DOWNLOAD_START", {
    addon: id,
    version: source.version,
    asset: source.assetName,
    abi: abis[0] || "unknown",
  });

  onProgress?.(0.05);
  // Resumable download so UI can cancel mid-flight.
  const downloadResumable = FileSystem.createDownloadResumable(
    source.downloadUrl,
    target,
    { headers: { Accept: "application/octet-stream" } },
    (progressData) => {
      const total = progressData.totalBytesExpectedToWrite || 0;
      const written = progressData.totalBytesWritten || 0;
      if (total > 0) {
        onProgress?.(Math.min(0.99, Math.max(0.05, written / total)));
      } else {
        onProgress?.(0.2);
      }
    },
  );
  activeAddonDownload = downloadResumable;
  let result: FileSystem.FileSystemDownloadResult | undefined;
  try {
    result = await downloadResumable.downloadAsync();
  } catch (e: unknown) {
    if (String(errorMessage(e)).toLowerCase().includes("cancel") || !activeAddonDownload) {
      throw new Error("DOWNLOAD_CANCELLED");
    }
    throw e;
  } finally {
    if (activeAddonDownload === downloadResumable) activeAddonDownload = null;
  }
  if (!result) {
    throw new Error("DOWNLOAD_CANCELLED");
  }
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`Скачивание APK завершилось HTTP ${result.status}`);
  }

  const expectedSha256 = source.expectedSha256;
  const actualSha256 = n.sha256File ? await n.sha256File(result.uri) : "";
  if (!/^[a-f0-9]{64}$/i.test(actualSha256) || actualSha256.toLowerCase() !== expectedSha256) {
    persistentLogger.markAppEvent("TERMUX_ADDON_INTEGRITY_FAILED", {
      addon: id,
      version: source.version,
      asset: source.assetName,
    });
    try { await FileSystem.deleteAsync(result.uri, { idempotent: true }); } catch { /* ignore cleanup failure */ }
    throw new Error("ADDON_APK_SHA256_MISMATCH");
  }

  onProgress?.(1);
  persistentLogger.markAppEvent("TERMUX_ADDON_DOWNLOAD_DONE", {
    addon: id,
    version: source.version,
    asset: source.assetName,
    uri: result.uri,
    sha256: expectedSha256,
  });
  return { version: source.version, assetName: source.assetName, uri: result.uri };
}

/** Отмена текущего скачивания addon APK (если идёт). */
export async function cancelAddonDownload(): Promise<void> {
  const d = activeAddonDownload;
  activeAddonDownload = null;
  if (!d) return;
  try {
    await d.pauseAsync();
  } catch {
    // ignore
  }
  persistentLogger.markAppEvent("TERMUX_ADDON_DOWNLOAD_CANCELLED");
}

/** Запускает системный установщик Android для уже скачанного APK. */
export async function launchApkInstall(uri: string, id?: AddonId): Promise<void> {
  const n = native();
  if (!n?.installApk) throw new Error("Нативный установщик APK недоступен. Нужна новая Android-сборка.");
  await n.installApk(uri);
  persistentLogger.markAppEvent("TERMUX_ADDON_INSTALL_LAUNCHED", { addon: id || "unknown", uri });
}

/** @deprecated Используйте downloadAddon + launchApkInstall (диалог перед установкой). */
export async function downloadAndInstallAddon(
  id: AddonId,
  onProgress?: (progress: number) => void,
): Promise<{ version: string; assetName: string; uri: string }> {
  const result = await downloadAddon(id, onProgress);
  await launchApkInstall(result.uri, id);
  return result;
}

export function getAddonFallbackPage(id: AddonId): string {
  return SOURCES[id].fallbackPage;
}
