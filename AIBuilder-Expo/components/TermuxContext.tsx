import { createContext, useContext, useState, useCallback, useEffect, useRef, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  checkTermuxReadiness,
  requestRunCommandPermission,
  type TermuxReadiness,
} from "../lib/termux-bridge";
import { useLanguage } from "./LanguageContext";
import { persistAsyncStorageItem } from "../lib/persistence";
import { useDialog } from "./DialogContext";
import { useLoggerContext } from "./LoggerContext";
import type { TranslationKey } from "../lib/i18n";

const STORAGE_KEY = "aibuilder.termux.enabled.v1";

export type BuildStageStatus = "pending" | "active" | "done" | "error" | "skipped";

export interface BuildStage {
  id: string;
  label: string;
  status: BuildStageStatus;
  detail?: string;
}

export interface ReverseToolStatus {
  id: string;
  label: string;
  status: "installed" | "missing" | "optional";
  kind?: "pkg" | "pip" | "jar" | "runtime";
}

interface TermuxActivity {
  command: string;
  step: number;
  maxSteps: number;
  title?: string;
  detail?: string;
  stage?: string;
  stageIndex?: number;
  stageCount?: number;
  stages?: BuildStage[];
  isBuild?: boolean;
  recovery?: number;
  maxRecovery?: number;
  diagnosis?: string;
  action?: string;
  result?: string;
  isReverse?: boolean;
  reverseTools?: ReverseToolStatus[];
}

interface TermuxContextType {
  /** Termux-сессия включена и прошла проверку готовности. */
  enabled: boolean;
  /** Идёт проверка готовности (после нажатия "включить"). */
  checking: boolean;
  /** Пользователь включает/выключает через кнопки в боковом меню. true = готово. */
  setEnabled: (value: boolean) => Promise<boolean>;
  /** Текущая команда агента (для панели активности). */
  activity: TermuxActivity | null;
  setActivity: (a: TermuxActivity | null) => void;
}

const TermuxContext = createContext<TermuxContextType | null>(null);

function reasonToMessageKey(reason: TermuxReadiness["reasons"][number]): TranslationKey {
  switch (reason) {
    case "not_android":
      return "termuxReasonNotAndroid";
    case "native_module_missing":
      return "termuxReasonNativeMissing";
    case "termux_not_installed":
      return "termuxReasonNotInstalled";
    case "run_command_permission_missing":
      return "termuxReasonPermissionMissing";
    case "run_command_probe_failed":
      return "termuxReasonProbeFailed";
    default:
      return "termuxReasonUnknown";
  }
}

export function TermuxProvider({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  const { showDialog } = useDialog();
  const { logInfo, logWarn } = useLoggerContext();
  const [enabled, setEnabledState] = useState(false);
  const [checking, setChecking] = useState(false);
  const [activity, setActivity] = useState<TermuxActivity | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        // Stored value is a user preference, not proof that Termux is still
        // installed/permissioned after a restart. Re-check readiness before
        // exposing an effective enabled=true state.
        if (raw === "1") {
          setChecking(true);
          const readiness = await checkTermuxReadiness({ deep: true });
          setEnabledState(readiness.ready);
          if (!readiness.ready) {
            logWarn("Termux", t("termuxNotReadyLog", { reasons: readiness.reasons.join(", ") }));
          }
        }
      } catch {
        // остаёмся выключенными по умолчанию
        setEnabledState(false);
      } finally {
        setChecking(false);
        hydrated.current = true;
      }
    })();
  }, [logWarn, t]);

  const persist = useCallback((value: boolean) => {
    persistAsyncStorageItem(STORAGE_KEY, value ? "1" : "0");
  }, []);

  const setEnabled = useCallback(
    async (value: boolean): Promise<boolean> => {
      if (!value) {
        setEnabledState(false);
        persist(false);
        logInfo("Termux", t("termuxSessionStoppedLog"));
        return false;
      }

      setChecking(true);
      try {
        // Разрешение RUN_COMMAND — обычное runtime-разрешение Android,
        // запрашиваем его именно сейчас (по нажатию кнопки), а не при
        // старте приложения — так пользователь понимает, зачем оно нужно.
        await requestRunCommandPermission();

        const readiness = await checkTermuxReadiness({ deep: true });
        if (!readiness.ready) {
          const lines = readiness.reasons.map((r) => `• ${t(reasonToMessageKey(r))}`).join("\n");
          logWarn("Termux", t("termuxNotReadyLog", { reasons: readiness.reasons.join(", ") }));
          // Диалог без списка команд: команды теперь на экране «Настройки Termux»
          // (карточки «скопировать + открыть Termux»). Здесь только описание и
          // кнопки «Открыть настройки» / «Отмена».
          showDialog(
            t("termuxSetupTitle"),
            `${t("termuxSetupIntro")}\n\n${lines}`,
            [
              { text: t("cancel"), style: "cancel" as const },
            ]
          );
          setEnabledState(false);
          persist(false);
          return false;
        }

        setEnabledState(true);
        persist(true);
        logInfo("Termux", t("termuxSessionStartedLog"));
        return true;
      } finally {
        setChecking(false);
      }
    },
    [persist, showDialog, t, logInfo, logWarn]
  );


  return (
    <TermuxContext.Provider value={{ enabled, checking, setEnabled, activity, setActivity }}>
      {children}
    </TermuxContext.Provider>
  );
}

export function useTermuxContext() {
  const ctx = useContext(TermuxContext);
  if (!ctx) throw new Error("useTermuxContext must be used within TermuxProvider");
  return ctx;
}
