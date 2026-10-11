/**
 * Единый статус моста Termux: готов / RUN_COMMAND / allow-external-apps
 * + действия «починить» (priority #1, #6).
 */

import { Linking, Platform } from "react-native";
import {
  checkTermuxReadiness,
  openRunCommandPermissionSettings,
  probeTermuxCommand,
  getTermuxNative,
  type TermuxReadiness,
} from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";
import { buildTermuxStatusFlags, type TermuxStatusFlag } from "./termux-status-flags";
export type { TermuxStatusFlag } from "./termux-status-flags";

export type TermuxBridgeStatus = {
  ready: boolean;
  flags: TermuxStatusFlag[];
  readiness: TermuxReadiness;
  probeDetail?: string;
};

export async function getTermuxBridgeStatus(deep = true): Promise<TermuxBridgeStatus> {
  const readiness = await checkTermuxReadiness({ deep, refreshPermission: deep });
  const flags: TermuxStatusFlag[] = buildTermuxStatusFlags(readiness);
  return {
    ready: readiness.ready,
    flags,
    readiness,
    probeDetail: readiness.probeDetail,
  };
}

/**
 * Мастер / кнопка «починить»: по шагам чинит окружение.
 * Returns human-readable steps taken.
 */
export async function repairTermuxBridge(): Promise<string[]> {
  const steps: string[] = [];
  if (Platform.OS !== "android") {
    steps.push("Не Android — Termux недоступен");
    return steps;
  }

  const native = getTermuxNative();
  if (!native) {
    steps.push("Native-модуль отсутствует — пересоберите приложение с withTermuxBridge");
    return steps;
  }

  const installed = await native.isTermuxInstalled().then((value) => value, () => null);
  if (installed === null) {
    steps.push("Не удалось проверить наличие Termux — повторите проверку или откройте настройки Android");
    return steps;
  }
  if (!installed) {
    steps.push("Termux не установлен");
    try {
      await Linking.openURL("https://f-droid.org/packages/com.termux/");
      steps.push("Открыт F-Droid → Termux");
    } catch {
      steps.push("Не удалось открыть F-Droid");
    }
    return steps;
  }
  steps.push("Termux установлен ✓");

  const perm = await native.hasRunCommandPermission().catch(() => null);
  let canProbe = perm === true;
  if (perm === null) {
    steps.push("Не удалось прочитать статус RUN_COMMAND — откройте настройки Android → Приложения → AI Builder → Разрешения");
    persistentLogger.add("warn", "TermuxStatus", steps.join(" | "));
    return steps;
  } else if (!perm) {
    steps.push("RUN_COMMAND — специальное разрешение Android/Termux, не обычный runtime-запрос. Вручную откройте Настройки Android → Приложения → AI Builder → Разрешения → Дополнительные разрешения → RUN_COMMAND.");
    const opened = await openRunCommandPermissionSettings();
    steps.push(opened
      ? "Открыты настройки AI Builder. Включите RUN_COMMAND вручную; после возврата нажмите «Проверить» ещё раз. До подтверждения команды не запускаются."
      : "Не удалось открыть настройки автоматически. Откройте указанный путь вручную; после возврата нажмите «Проверить» ещё раз.");
    persistentLogger.add("info", "TermuxStatus", steps.join(" | "));
    return steps;
  } else {
    steps.push("RUN_COMMAND есть ✓");
  }

  // Open Termux so user can set allow-external-apps
  try {
    await native.openPackage("com.termux");
    steps.push("Termux открыт — выполните: echo allow-external-apps=true >> ~/.termux/termux.properties && termux-reload-settings");
  } catch {
    steps.push("Не удалось открыть Termux");
  }

  if (canProbe) {
    const probe = await probeTermuxCommand();
    if (probe == null) {
      steps.push("Probe echo AIBUILDER_OK — OK ✓");
    } else {
      steps.push(`RUN_COMMAND разрешение подтверждено, но live probe не прошёл: ${probe}`);
      steps.push("Отдельно проверьте allow-external-apps=true в ~/.termux/termux.properties и выполните termux-reload-settings");
    }
  } else {
    steps.push("Live probe пропущен: Android-разрешение RUN_COMMAND не подтверждено");
  }

  persistentLogger.add("info", "TermuxStatus", steps.join(" | "));
  return steps;
}

/** 4-step onboarding checklist state. */
export type OnboardingStepId = "install" | "allow_external" | "packages" | "echo_ok";

export async function getOnboardingSteps(): Promise<
  Array<{ id: OnboardingStepId; done: boolean; title: string; actionHint: string }>
> {
  const st = await getTermuxBridgeStatus(true);
  const installed = st.flags.find((f) => f.id === "installed")?.ok ?? false;
  const runCmd = st.flags.find((f) => f.id === "run_command")?.ok ?? false;
  const probeOk = st.flags.find((f) => f.id === "probe")?.ok ?? false;
  return [
    {
      id: "install",
      done: installed,
      title: "1. Установить Termux",
      actionHint: "F-Droid → Termux, откройте один раз",
    },
    {
      id: "allow_external",
      done: probeOk, // probe implies allow-external works
      title: "2. allow-external-apps",
      actionHint: 'В Termux: echo "allow-external-apps=true" >> ~/.termux/termux.properties && termux-reload-settings',
    },
    {
      id: "packages",
      done: runCmd && installed,
      title: "3. Android-разрешение RUN_COMMAND",
      actionHint: "Настройки Android → Приложения → AI Builder → Разрешения → Дополнительные разрешения → Выполнять команды в Termux",
    },
    {
      id: "echo_ok",
      done: probeOk,
      title: "4. Тест echo OK",
      actionHint: "Кнопка «Проверить» должна вернуть AIBUILDER_OK",
    },
  ];
}
