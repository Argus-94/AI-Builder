import { createContext, useContext, ReactNode, useEffect } from "react";
import { AppState } from "react-native";
import { useLogger, LogEntry, LogLevel } from "../hooks/useLogger";
import { persistentLogger } from "../lib/persistent-logger";

interface LoggerContextType {
  logs: LogEntry[];
  logInfo: (tag: string, message: string) => void;
  logWarn: (tag: string, message: string) => void;
  logError: (tag: string, message: string) => void;
  logDebug: (tag: string, message: string) => void;
  clearLogs: () => void;
  exportLogsToFile: (dialogTitle?: string) => Promise<string | null>;
  getLogsByLevel: (level: LogLevel) => LogEntry[];
}

const LoggerContext = createContext<LoggerContextType | null>(null);

export function LoggerProvider({ children }: { children: ReactNode }) {
  const logger = useLogger();
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      persistentLogger.markAppEvent("APP_STATE", { state });
    });
    persistentLogger.markAppEvent("APP_READY");
    return () => sub.remove();
  }, []);
  return (
    <LoggerContext.Provider value={logger}>
      {children}
    </LoggerContext.Provider>
  );
}

export function useLoggerContext() {
  const ctx = useContext(LoggerContext);
  if (!ctx) throw new Error("useLoggerContext must be used within LoggerProvider");
  return ctx;
}
