/**
 * Optional native accelerator loader (plan G).
 * NativeModules.AibNativeAccel — open MIT module from plugins/withAibNativeAccel.js
 */
import { NativeModules, Platform } from "react-native";
import { persistentLogger } from "../../lib/persistent-logger";

export type NativeAccelProbe = {
  ok: boolean;
  detail?: string;
  jni?: boolean;
  version?: string;
};

export type NativeAccelModule = {
  isAvailable: () => Promise<boolean>;
  probe: () => Promise<NativeAccelProbe>;
  exec: (command: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>;
  mapPath?: (path: string, from: string, to: string) => Promise<string>;
};

export function getNativeAccelModule(): NativeAccelModule | null {
  if (Platform.OS !== "android") return null;
  try {
    const mod = (NativeModules as { AibNativeAccel?: NativeAccelModule }).AibNativeAccel;
    if (!mod || typeof mod !== "object") return null;
    if (typeof mod.isAvailable !== "function" || typeof mod.probe !== "function") return null;
    return mod;
  } catch {
    return null;
  }
}

export async function isNativeAccelLinked(): Promise<boolean> {
  const mod = getNativeAccelModule();
  if (!mod) {
    return false;
  }
  try {
    const available = await mod.isAvailable();
    if (!available) {
      persistentLogger.add("info", "NativeAccel", "module present but isAvailable=false");
      return false;
    }
    const p = await mod.probe();
    const ok = !!p?.ok;
    persistentLogger.add(
      "info",
      "NativeAccel",
      `probe ok=${ok} jni=${!!p?.jni} ${p?.detail || ""}`.trim(),
    );
    return ok;
  } catch (e: unknown) {
    persistentLogger.add(
      "warn",
      "NativeAccel",
      `probe failed: ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}
