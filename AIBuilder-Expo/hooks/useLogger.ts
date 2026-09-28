import { useState, useCallback, useEffect } from "react";
// В Expo SDK 54 (expo-file-system 19.x, стабильный релиз) старые методы
// (writeAsStringAsync, cacheDirectory, EncodingType) при импорте из
// "expo-file-system" не удалены, а лишь помечены deprecated и при вызове
// выбрасывают исключение — из-за этого export лога всегда падал в catch
// и показывал "Не удалось сохранить лог". Явно используем legacy-подмодуль,
// где эти методы работают как раньше.
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { persistentLogger, redactLogText, type LogEntry, type LogLevel } from "../lib/persistent-logger";
import { exportTracesAsText } from "../lib/agent-trace";
import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { getDeviceProfile } from "../lib/device-profile";

export type { LogEntry, LogLevel };

function safeDeviceField(key: string): string {
  try {
    const v = (Device as unknown as Record<string, unknown>)[key];
    if (v == null) return "unknown";
    if (typeof v === "function") {
      try {
        const r = (v as () => unknown)();
        return r == null ? "unknown" : String(r);
      } catch {
        return "unknown";
      }
    }
    return String(v);
  } catch {
    return "unknown";
  }
}


function formatTime(ts: number) {
  const d = new Date(ts);
  return (
    d.getFullYear().toString().slice(2) +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0") +
    " " +
    String(d.getHours()).padStart(2, "0") +
    ":" +
    String(d.getMinutes()).padStart(2, "0") +
    ":" +
    String(d.getSeconds()).padStart(2, "0")
  );
}

/**
 * Лог теперь живёт в lib/persistent-logger.ts (переживает краш и перезапуск
 * приложения, см. комментарии там и в lib/crash-handlers.ts) — этот хук лишь
 * подписывает React-состояние экрана на этот синглтон, чтобы UI (например,
 * app/log-screen.tsx) обновлялся как раньше.
 */
export function useLogger() {
  const [logs, setLogs] = useState<LogEntry[]>(() => [...persistentLogger.getAll()].reverse());

  useEffect(() => {
    // hydrate() безопасно вызывать многократно из разных компонентов —
    // повторные вызовы возвращают тот же промис и ничего не делают дважды.
    persistentLogger.hydrate();
    const unsubscribe = persistentLogger.subscribe((entries) => {
      setLogs([...entries].reverse());
    });
    return unsubscribe;
  }, []);

  const logInfo = useCallback((tag: string, message: string) => {
    persistentLogger.add("info", tag, message);
  }, []);
  const logWarn = useCallback((tag: string, message: string) => {
    persistentLogger.add("warn", tag, message);
  }, []);
  const logError = useCallback((tag: string, message: string) => {
    persistentLogger.add("error", tag, message);
  }, []);
  const logDebug = useCallback((tag: string, message: string) => {
    persistentLogger.add("debug", tag, message);
  }, []);

  const clearLogs = useCallback(() => {
    persistentLogger.clear();
  }, []);

  const exportLogsToFile = useCallback(async (dialogTitle?: string): Promise<string | null> => {
    const current = persistentLogger.getAll(); // уже в хронологическом порядке (старые → новые)
    if (current.length === 0) return null;

    const lines = current.map(
      (l) => `[${formatTime(l.timestamp)}] [${l.level.toUpperCase()}] [${l.source || "app"}] [${l.sessionId || "unknown-session"}] [${l.tag}] ${l.message}`
    );

    let deviceBlock = "=== Device ===\n(unavailable)\n";
    try {
      const profile = await getDeviceProfile(true);
      const memGb =
        profile.totalMemoryGB != null ? profile.totalMemoryGB.toFixed(2) : "unknown";
      const memBytes =
        profile.totalMemoryBytes != null ? String(profile.totalMemoryBytes) : "unknown";
      const arch = profile.supportedCpuArchitectures?.join(", ") || "unknown";
      const appVer =
        Constants.expoConfig?.version ||
        Constants.nativeAppVersion ||
        "unknown";
      const buildNum =
        Constants.nativeBuildVersion ||
        String(Constants.expoConfig?.android?.versionCode ?? "") ||
        "unknown";
      deviceBlock = [
        "=== Device ===",
        `Manufacturer: ${profile.manufacturer ?? "unknown"}`,
        `Brand: ${safeDeviceField("brand")}`,
        `Model: ${profile.modelName ?? safeDeviceField("modelName")}`,
        `Design name: ${safeDeviceField("designName")}`,
        `Product name: ${safeDeviceField("productName")}`,
        `Device type: ${safeDeviceField("deviceType")}`,
        `Device year class: ${safeDeviceField("deviceYearClass")}`,
        `Physical device: ${profile.isPhysicalDevice}`,
        `OS: ${Platform.OS} ${profile.osVersion ?? safeDeviceField("osVersion")}`,
        `Platform version: ${String(Platform.Version)}`,
        `OS build fingerprint: ${safeDeviceField("osBuildFingerprint")}`,
        `OS internal build id: ${safeDeviceField("osInternalBuildId")}`,
        `OS name: ${safeDeviceField("osName")}`,
        `Total memory: ${memGb} GB (${memBytes} bytes)`,
        `CPU arch: ${arch}`,
        `App version: ${appVer} (${buildNum})`,
        "",
      ].join("\n");
    } catch (e) {
      deviceBlock =
        "=== Device ===\n(error: " +
        (e instanceof Error ? e.message : String(e)) +
        ")\n";
    }

    let tracesBlock = "";
    try {
      tracesBlock = "\n" + (await exportTracesAsText(12));
    } catch {
      tracesBlock = "\n=== Agent Traces ===\n(export error)\n";
    }

    const content =
      "=== AI Builder Log ===\n" +
      "Generated: " +
      new Date().toISOString() +
      "\nTotal entries: " +
      String(lines.length) +
      "\n\n" +
      deviceBlock +
      tracesBlock +
      "\n=== Log entries ===\n" +
      lines.join("\n");

    const fileName = `ai-builder-log-${Date.now()}.txt`;
    const filePath = FileSystem.cacheDirectory + fileName;

    try {
      await FileSystem.writeAsStringAsync(filePath, redactLogText(content), { encoding: FileSystem.EncodingType.UTF8 });

      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(filePath, {
          mimeType: "text/plain",
          dialogTitle: dialogTitle || "Save log",
          UTI: "public.plain-text",
        });
      }
      return filePath;
    } catch (err) {
      console.log("Export log error:", err);
      return null;
    }
  }, []);

  const getLogsByLevel = useCallback(
    (level: LogLevel) => logs.filter((l) => l.level === level),
    [logs]
  );

  return {
    logs,
    logInfo,
    logWarn,
    logError,
    logDebug,
    clearLogs,
    exportLogsToFile,
    getLogsByLevel,
  };
}
