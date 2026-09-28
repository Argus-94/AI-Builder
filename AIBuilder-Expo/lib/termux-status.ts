/**
 * Единый статус моста Termux: готов / RUN_COMMAND / allow-external-apps
 * + действия «починить» (priority #1, #6).
 */

import { Linking, Platform } from "react-native";
import {
  checkTermuxReadiness,
  requestRunCommandPermission,
  probeTermuxCommand,
  getTermuxNative,
  type TermuxReadiness,
} from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";

export type TermuxStatusFlag = {
  id: "installed" | "run_command" | "probe" | "native";
  ok: boolean;
  label: string;
  detail?: string;
};

export type TermuxBridgeStatus = {
  ready: boolean;
  flags: TermuxStatusFlag[];
  readiness: TermuxReadiness;
  probeDetail?: string;
};

export async function getTermuxBridgeStatus(deep = true): Promise<TermuxBridgeStatus> {
  const readiness = await checkTermuxReadiness({ deep });
  const reasons = new Set(readiness.reasons || []);
  const flags: TermuxStatusFlag[] = [
    {
      id: "native",
      ok: !reasons.has("native_module_missing") && !reasons.has("not_android"),
      label: "Native TermuxBridge",
      detail: reasons.has("not_android") ? "Не Android" : reasons.has("native_module_missing") ? "Модуль отсутствует" : "OK",
    },
    {
      id: "installed",
      ok: !reasons.has("termux_not_installed"),
      label: "Termux установлен",
      detail: reasons.has("termux_not_installed") ? "Установите Termux (F-Droid)" : "OK",
    },
    {
      id: "run_command",
      ok: !reasons.has("run_command_permission_missing"),
      label: "RUN_COMMAND",
      detail: reasons.has("run_command_permission_missing") ? "Нужно разрешение" : "OK",
    },
    {
      id: "probe",
      ok: !reasons.has("run_command_probe_failed") && (readiness.probed ? readiness.ready : !reasons.size),
      label: "echo AIBUILDER_OK",
      detail: readiness.probeDetail || (reasons.has("run_command_probe_failed") ? "probe failed" : deep ? "OK" : "не проверялся"),
    },
  ];
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

  const installed = await native.isTermuxInstalled().catch(() => false);
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

  const perm = await native.hasRunCommandPermission().catch(() => false);
  if (!perm) {
    const granted = await requestRunCommandPermission();
    steps.push(granted ? "RUN_COMMAND выдано ✓" : "RUN_COMMAND не выдано — разрешите вручную");
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

  const probe = await probeTermuxCommand();
  if (probe == null) {
    steps.push("Probe echo AIBUILDER_OK — OK ✓");
  } else {
    steps.push(`Probe failed: ${probe}`);
    steps.push("Проверьте allow-external-apps=true и termux-reload-settings");
  }

  persistentLogger.add("info", "TermuxStatus", steps.join(" | "));
  return steps;
}

/** 4-step onboarding checklist state. */
export type OnboardingStepId = "install" | "allow_external" | "packages" | "echo_ok";

export async function getOnboardingSteps(): Promise<
  Array<{ id: OnboardingStepId; done: boolean; title: string; actionHint: string }>
> {
  const st = await getTermuxBridgeStatus(false);
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
      title: "3. Разрешение RUN_COMMAND + пакеты",
      actionHint: "Выдайте RUN_COMMAND приложению; pkg install termux-api",
    },
    {
      id: "echo_ok",
      done: probeOk,
      title: "4. Тест echo OK",
      actionHint: "Кнопка «Проверить» должна вернуть AIBUILDER_OK",
    },
  ];
}
