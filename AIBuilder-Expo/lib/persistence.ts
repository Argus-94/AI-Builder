import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

function storageErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Fire-and-forget persistence with observable failures. Never logs the value being stored. */
export function persistAsyncStorageItem(key: string, value: string): void {
  void AsyncStorage.setItem(key, value).catch((error: unknown) => {
    console.warn(`[AIB][storage] AsyncStorage write failed for ${key}: ${storageErrorMessage(error)}`);
  });
}

/**
 * SecureStore write with one retry. Never logs the secret.
 * On persistent failure, mirrors a non-secret marker so UI can warn;
 * optional fallbackKey writes the value to AsyncStorage as last-resort recovery
 * (used only for provider API keys that otherwise leave the app unusable after restart).
 */
export function persistSecureStoreItem(key: string, value: string, opts?: { fallbackKey?: string }): void {
  const run = async () => {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch (error: unknown) {
      console.warn(`[AIB][storage] SecureStore write failed for ${key}: ${storageErrorMessage(error)}`);
    }
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch (error: unknown) {
      console.warn(`[AIB][storage] SecureStore retry failed for ${key}: ${storageErrorMessage(error)}`);
    }
    if (opts?.fallbackKey) {
      try {
        await AsyncStorage.setItem(opts.fallbackKey, value);
        console.warn(`[AIB][storage] SecureStore unavailable — mirrored ${key} to AsyncStorage fallback`);
      } catch (error: unknown) {
        console.warn(`[AIB][storage] fallback write failed for ${key}: ${storageErrorMessage(error)}`);
      }
    }
  };
  void run();
}

/** Read SecureStore with AsyncStorage fallback (for keys written via fallbackKey). */
export async function readSecureStoreItem(key: string, fallbackKey?: string): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(key);
    if (v != null && v !== "") return v;
  } catch {
    /* continue to fallback */
  }
  if (fallbackKey) {
    try {
      const v = await AsyncStorage.getItem(fallbackKey);
      if (v != null && v !== "") return v;
    } catch {
      /* ignore */
    }
  }
  return null;
}
