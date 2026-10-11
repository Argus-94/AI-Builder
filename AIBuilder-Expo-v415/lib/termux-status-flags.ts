export type TermuxStatusFlag = {
  id: "installed" | "run_command" | "probe" | "native";
  ok: boolean;
  label: string;
  detail?: string;
};

type ReadinessSnapshot = {
  ready: boolean;
  reasons: string[];
  probed?: boolean;
  probeDetail?: string;
};

/** Pure mapping so UI badges cannot infer a grant from a skipped native check. */
export function buildTermuxStatusFlags(readiness: ReadinessSnapshot): TermuxStatusFlag[] {
  const reasons = new Set(readiness.reasons || []);
  const nativeQueryAvailable = !reasons.has("not_android") && !reasons.has("native_module_missing");
  const installCheckFailed = reasons.has("termux_install_check_failed");
  const permissionCheckFailed = reasons.has("run_command_permission_check_failed");
  const installedMissing = reasons.has("termux_not_installed");
  const permissionMissing = reasons.has("run_command_permission_missing");
  const probeFailed = reasons.has("run_command_probe_failed");

  return [
    {
      id: "native",
      ok: nativeQueryAvailable,
      label: "Native TermuxBridge",
      detail: reasons.has("not_android")
        ? "Не Android"
        : reasons.has("native_module_missing")
          ? "Модуль отсутствует"
          : "OK",
    },
    {
      id: "installed",
      ok: nativeQueryAvailable && !installCheckFailed && !installedMissing,
      label: "Termux установлен",
      detail: !nativeQueryAvailable
        ? "Не проверено"
        : installedMissing
          ? "Установите Termux (F-Droid)"
          : installCheckFailed
            ? "Не удалось проверить наличие Termux"
            : "OK",
    },
    {
      id: "run_command",
      ok: nativeQueryAvailable && !permissionCheckFailed && !permissionMissing,
      label: "RUN_COMMAND",
      detail: !nativeQueryAvailable
        ? "Не проверено"
        : permissionMissing
          ? "Нет разрешения Android"
          : permissionCheckFailed
            ? "Статус разрешения не удалось прочитать"
            : "Выдано",
    },
    {
      id: "probe",
      ok: readiness.probed === true && !probeFailed && readiness.ready,
      label: "echo AIBUILDER_OK",
      detail:
        readiness.probeDetail ||
        (readiness.probed ? (probeFailed ? "probe failed" : "OK") : "не запускался"),
    },
  ];
}
