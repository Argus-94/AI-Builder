/**
 * Runtime panel — AIBuilderTermux status, sessions, containers, privileges.
 * Bound to active project from ProjectContext when available.
 * Does not alter compilation settings.
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "../components/LanguageContext";
import { runtimeText as rtText } from "../lib/runtime-i18n";
import { useTheme } from "../components/ThemeContext";
import { useProjectContext } from "../components/ProjectContext";
import { useRuntime } from "../hooks/useRuntime";
import { getRuntimeFacade } from "../lib/runtime-facade";
import { ProgressBar } from "../components/ProgressBar";
import { listForegroundTasks, subscribeForegroundTasks, withForegroundTask, type ForegroundTask } from "../lib/foreground-task";
import { notifyBootstrapProgress } from "../lib/app-notifications";
import { notePossibleBuildKill, maybeSurvivalReminder } from "../lib/background-survival";
import {
  adbPair,
  adbConnect,
  adbListDevices,
  adbWizardHelp,
  loadLastAdbHost,
  loadLastAdbSerial,
} from "../lib/adb-pairing";
import {
  bootstrapDebian,
  exportDebian,
  importDebian,
  defaultExportPath,
  type DistroProgress,
} from "../lib/debian-distro";
import { bindProjectToRuntime } from "../core/project-runtime";
import { startDeviceWatchdog, stopDeviceWatchdog } from "../lib/device-watchdog";
import { useLLM } from "../hooks/useLLM";

export default function RuntimeScreen() {
  const insets = useSafeAreaInsets();
  const { t, language } = useLanguage();
  const rt = (key: Parameters<typeof rtText>[1]) => rtText(language, key);
  const { runDeviceDevelopmentLoop, runSelfHealingDeviceQA, runAIReleaseGate, runAIReleaseArtifact, runAIReleaseChannel, runAIRollbackReleaseChannel, runAIProductionDeployment, runAIDeviceFleetDeployment, runAIFleetCanary, runAIFleetObservability, runAIFleetCommandCenter, runAIFleetUnifiedControlCenter, runAIFleetDeviceCommand, runAIFleetPolicy, setAIFleetPolicy, runAIFleetAudit, runAISecureFleetAudit, runAIVerifyFleetAudit, runAICreateFleetSnapshot, runAIRestoreFleetSnapshot, runAIExportFleetAuditBundle, runAICreateFleetBackup, runAIVerifyFleetBackup, runAIRestoreFleetBackup, runAIListFleetBackups, runAIFleetRecoveryDrill, runAIFleetRecoverySchedule, setAIFleetRecoverySchedule, runAIFleetRecoverySlo, runAIScheduledFleetRecovery, runAIFleetSloDashboard, acknowledgeAIFleetDashboardAlert, acknowledgeAIFleetDashboardIncident, runAIFleetAlertEscalation, acknowledgeAIFleetEscalatedAlert, resolveAIFleetEscalatedAlert } = useLLM();
  const { colors } = useTheme();
  const { project } = useProjectContext();
  const {
    status,
    diagnostics,
    loading,
    error,
    refresh,
    openProjectSession,
    launchUbuntu,
    openTerminal,
    createAgent,
    launchKali,
    runProotAuto,
    stopContainer,
    destroyContainer,
    runRecovery,
    listRecoveryActions,
    runFinalValidation,
    ensureRootfs,
    createBackup,
    restoreBackup,
  } = useRuntime();

  const defaultId = project?.id || project?.name || "demo";
  const [projectId, setProjectId] = useState(defaultId);
  const [busy, setBusy] = useState(false);
  const [healthBusy, setHealthBusy] = useState(false);
  const [userspaceSnap, setUserspaceSnap] = useState<string | null>(null);
  const [lastBootInfo, setLastBootInfo] = useState<string | null>(null);
  const [failureRows, setFailureRows] = useState<Array<{ id: string; code: string; component: string; message: string; at: number }>>([]);
  const [healthRows, setHealthRows] = useState<Array<{ id: string; level: string; message: string; repairable?: boolean }>>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [backupPath, setBackupPath] = useState("");
  const [backupScope, setBackupScope] = useState<"full" | "projects" | "sessions" | "toolchains">("full");
  const [backupList, setBackupList] = useState<Array<{ path: string; scope?: string; createdAt?: number; digest?: string; fileCount?: number; totalBytes?: number; appVersion?: string }>>([]);
  const [backupInspect, setBackupInspect] = useState<string>("");
  const [backupBusy, setBackupBusy] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceAvailable, setDeviceAvailable] = useState<boolean | null>(null);
  const [adbPairHost, setAdbPairHost] = useState("");
  const [adbPairCode, setAdbPairCode] = useState("");
  const [adbConnectHost, setAdbConnectHost] = useState("");
  const [adbDevicesText, setAdbDevicesText] = useState("");
  const [deviceOutput, setDeviceOutput] = useState<string>("");
  const [deviceApkPath, setDeviceApkPath] = useState("/storage/emulated/0/Download/app-debug.apk");
  const [devicePackageName, setDevicePackageName] = useState("");
  const [deviceGoal, setDeviceGoal] = useState("Проверь главный экран приложения: он должен открыться без crash, найди основное действие и убедись, что оно работает.");
  const [deviceLoopBusy, setDeviceLoopBusy] = useState(false);
  const [deviceSuiteBusy, setDeviceSuiteBusy] = useState(false);
  const [deviceSelfHealBusy, setDeviceSelfHealBusy] = useState(false);
  const [deviceReleaseGateBusy, setDeviceReleaseGateBusy] = useState(false);
  const [deviceReleaseArtifactBusy, setDeviceReleaseArtifactBusy] = useState(false);
  const [deviceReleaseChannelBusy, setDeviceReleaseChannelBusy] = useState(false);
  const [deviceRollbackBusy, setDeviceRollbackBusy] = useState(false);
  const [deviceDeployBusy, setDeviceDeployBusy] = useState(false);
  const [deviceReleaseChannel, setDeviceReleaseChannel] = useState("internal");
  const [fleetCommandBusy, setFleetCommandBusy] = useState(false);
  const [fleetSnapshot, setFleetSnapshot] = useState<any | null>(null);
  const [fleetUnifiedControl, setFleetUnifiedControl] = useState<any | null>(null);
  const [fleetPolicy, setFleetPolicy] = useState<any | null>(null);
  const [fleetRole, setFleetRole] = useState("operator");
  const [fleetConfirmation, setFleetConfirmation] = useState("DEPLOY PRODUCTION");
  const [fleetBackupSecret, setFleetBackupSecret] = useState("");
  const [fleetBackups, setFleetBackups] = useState<any[]>([]);
  const [fleetRecoverySchedule, setFleetRecoveryScheduleState] = useState<any | null>(null);
  const [fleetRecoverySlo, setFleetRecoverySlo] = useState<any | null>(null);
  const [fleetSloDashboard, setFleetSloDashboard] = useState<any | null>(null);
  const [fleetEscalation, setFleetEscalation] = useState<any | null>(null);
  const [linuxStatus, setLinuxStatus] = useState<any | null>(null);
  const [linuxOutput, setLinuxOutput] = useState("");
  const [containerBusy, setContainerBusy] = useState(false);
  const [containerId, setContainerId] = useState<string | null>(null);
  const [containerOutput, setContainerOutput] = useState("");
  const [linuxBusy, setLinuxBusy] = useState(false);
  const [debianProgress, setDebianProgress] = useState<DistroProgress | null>(null);
  const [debianExportPath, setDebianExportPath] = useState("");
  const [debianImportPath, setDebianImportPath] = useState("");
  const [fgTasks, setFgTasks] = useState<ForegroundTask[]>([]);
  const [bootState, setBootState] = useState<any | null>(null);
  const [bootBusy, setBootBusy] = useState(false);
  const [bootPercent, setBootPercent] = useState(0);
  const [bootMsg, setBootMsg] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workspaceBuildBusy, setWorkspaceBuildBusy] = useState(false);
  const [workspaceBuildOutput, setWorkspaceBuildOutput] = useState("");
  const [projectGenerateBusy, setProjectGenerateBusy] = useState(false);
  const [projectGenerateOutput, setProjectGenerateOutput] = useState("");
  const [codingAgentBusy, setCodingAgentBusy] = useState(false);
  const [codingAgentOutput, setCodingAgentOutput] = useState("");
  const [realDeviceBusy, setRealDeviceBusy] = useState(false);
  const [realDeviceOutput, setRealDeviceOutput] = useState("");
  const [persistentWorkspaceBusy, setPersistentWorkspaceBusy] = useState(false);
  const [persistentWorkspaceOutput, setPersistentWorkspaceOutput] = useState("");
  const [projectMemoryBusy, setProjectMemoryBusy] = useState(false);
  const [projectMemoryOutput, setProjectMemoryOutput] = useState("");
  const [factoryBusy, setFactoryBusy] = useState(false);
  const [factoryName, setFactoryName] = useState(defaultId);
  const [factoryPrompt, setFactoryPrompt] = useState("Создай Android Expo-приложение с главным экраном и одной полезной функцией. Подготовь рабочий APK.");
  const [factoryOutput, setFactoryOutput] = useState("");

  useEffect(() => {
    if (project?.id) setProjectId(project.id);
  }, [project?.id]);

  useEffect(() => {
    setFgTasks(listForegroundTasks());
    return subscribeForegroundTasks((tasks) => setFgTasks([...tasks]));
  }, []);

  // A3: soft-start process supervisor when Runtime screen is open (not cold-start battery).
  useEffect(() => {
    try {
      getRuntimeFacade().startSupervisor();
    } catch {
      /* optional */
    }
    return () => {
      /* leave running for long jobs; user can Stop */
    };
  }, []);


  useEffect(() => {
    void (async () => {
      const h = await loadLastAdbHost();
      if (h) setAdbConnectHost(h);
      const s = await loadLastAdbSerial();
      if (s) setAdbDevicesText((prev) => prev || `last: ${s}`);
    })();
  }, []);

  const onRunRealDeviceIntegration = useCallback(async () => {
    setRealDeviceBusy(true);
    setRealDeviceOutput("");
    try {
      const result = await getRuntimeFacade().runRealDeviceIntegration({
        apkPath: deviceApkPath.trim() || undefined,
        packageName: devicePackageName.trim() || undefined,
        launch: Boolean(devicePackageName.trim()),
        screenshotPath: `${getRuntimeFacade().home.cache}/phase33-device.png`,
      });
      setRealDeviceOutput(JSON.stringify(result, null, 2));
    } catch (e) {
      setRealDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setRealDeviceBusy(false);
    }
  }, [deviceApkPath, devicePackageName]);

  const onPersistentWorkspace = useCallback(async (action: "status" | "checkpoint" | "snapshot" | "undo") => {
    const id = projectId.trim() || project?.id || defaultId;
    setPersistentWorkspaceBusy(true);
    setPersistentWorkspaceOutput("");
    try {
      const runtime = getRuntimeFacade();
      let result: unknown;
      if (action === "status") {
        const [status, history] = await Promise.all([runtime.persistentWorkspaceStatus(id), runtime.persistentWorkspaceHistory(id, 8)]);
        result = { status, history, diff: status.clean ? "" : await runtime.persistentWorkspaceDiff(id) };
      } else if (action === "checkpoint") {
        result = await runtime.persistentWorkspaceCheckpoint(id, "AI Builder checkpoint");
      } else if (action === "snapshot") {
        result = await runtime.persistentWorkspaceSnapshot(id, "manual");
      } else {
        await runtime.persistentWorkspaceRestore(id, "HEAD~1");
        result = await runtime.persistentWorkspaceStatus(id);
      }
      setPersistentWorkspaceOutput(JSON.stringify(result, null, 2));
    } catch (e) {
      setPersistentWorkspaceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setPersistentWorkspaceBusy(false);
    }
  }, [projectId, project?.id, defaultId]);

  const onProjectMemory = useCallback(async (action: "status" | "build" | "fix" | "test" | "reset") => {
    const id = projectId.trim() || project?.id || defaultId;
    setProjectMemoryBusy(true); setProjectMemoryOutput("");
    try {
      const runtime = getRuntimeFacade(); let result: unknown;
      if (action === "status") result = await runtime.projectMemoryGet(id);
      else if (action === "build") result = await runtime.projectMemoryRecordBuild(id, "Manual build checkpoint", "Recorded from Runtime UI");
      else if (action === "fix") result = await runtime.projectMemoryRecordFix(id, "Manual successful fix", "Recorded from Runtime UI");
      else if (action === "test") result = await runtime.projectMemoryRecordTest(id, "Manual test checkpoint", "Recorded from Runtime UI");
      else result = await runtime.projectMemoryReset(id);
      setProjectMemoryOutput(JSON.stringify(result, null, 2));
    } catch (e) { setProjectMemoryOutput(e instanceof Error ? e.message : String(e)); }
    finally { setProjectMemoryBusy(false); }
  }, [projectId, project?.id, defaultId]);

  const onOneClickFactory = useCallback(async () => {
    const name = factoryName.trim() || projectId.trim() || defaultId;
    const prompt = factoryPrompt.trim();
    if (!prompt) { setFactoryOutput("Factory prompt is required"); return; }
    setFactoryBusy(true);
    setFactoryOutput("");
    try {
      const result = await getRuntimeFacade().runOneClickAppFactory({
        name,
        prompt,
        template: "expo",
        runDeviceQA: false,
        maxCodingIterations: 3,
        maxBuildAttempts: 2,
      });
      setFactoryOutput(JSON.stringify(result, null, 2));
    } catch (e) {
      setFactoryOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setFactoryBusy(false);
      await refresh();
    }
  }, [factoryName, factoryPrompt, projectId, defaultId, refresh]);

  const onOpenSession = useCallback(() => {
    const id = projectId.trim() || defaultId;
    openProjectSession(id);
    setMessage(`session:${id}`);
  }, [openProjectSession, projectId, defaultId]);

  const onLaunchUbuntu = useCallback(async () => {
    const id = projectId.trim() || defaultId;
    setBusy(true);
    setMessage(null);
    try {
      await launchUbuntu(id);
      setMessage(`ubuntu:${id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [launchUbuntu, projectId, defaultId]);

  const onOpenTerminal = useCallback(async () => {
    const id = projectId.trim() || defaultId;
    setBusy(true);
    setMessage(null);
    try {
      const termId = await openTerminal(id);
      setMessage(`terminal:${termId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [openTerminal, projectId, defaultId]);

  const onCreateAgent = useCallback(() => {
    const id = projectId.trim() || defaultId;
    try {
      const agentId = createAgent(id);
      setMessage(`agent:${agentId}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [createAgent, projectId, defaultId]);

  const onLaunchKali = useCallback(async () => {
    const id = projectId.trim() || defaultId;
    setBusy(true);
    setMessage(null);
    try {
      await launchKali(id);
      setMessage(`kali:${id}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [launchKali, projectId, defaultId]);

  const onRunProot = useCallback(async () => {
    const id = projectId.trim() || defaultId;
    setBusy(true);
    setMessage(null);
    try {
      const ubuntu = status?.containerList?.find(
        (c) => c.imageId.includes("ubuntu") && (!c.projectId || c.projectId === id),
      );
      const instanceId = ubuntu?.id ?? `auto-${id}`;
      const out = await runProotAuto("ubuntu", instanceId, id);
      setMessage(out.slice(0, 300));
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [runProotAuto, projectId, defaultId, status?.containerList]);

  const onLinuxStatus = useCallback(async () => {
    setLinuxBusy(true);
    try {
      const result = await getRuntimeFacade().linuxStatus("debian");
      setLinuxStatus(result);
      setLinuxOutput(result.message);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLinuxOutput(
        /RUN_COMMAND|allow-external|SecurityException|Termux|not linked|unavailable/i.test(msg)
          ? {
              ru: "Нет связи с Termux. Проверьте: Termux установлен → Настройки Termux в AI Builder → allow-external-apps=true → termux-reload-settings.\n" + msg,
              uk: "Немає зв'язку з Termux. Перевірте allow-external-apps.\n" + msg,
              en: "No Termux link. Enable allow-external-apps and reload Termux settings.\n" + msg,
            }[language]
          : msg,
      );
    } finally { setLinuxBusy(false); }
  }, [language]);

  const onLinuxCheck = useCallback(async () => {
    setLinuxBusy(true);
    setLinuxOutput("Linux: running uname…");
    try {
      const result = await getRuntimeFacade().linuxExec("uname", ["-a"], { profile: "debian", cwd: "/tmp", timeoutMs: 15000 });
      setLinuxOutput((result.stdout || result.stderr || `exit=${result.exitCode}`).slice(-4000));
      setLinuxStatus(await getRuntimeFacade().linuxStatus("debian"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLinuxOutput(
        /not installed|no such|proot|debian|distro/i.test(msg)
          ? {
              ru: "Debian ещё не готов. Нажмите «Установить Linux» или шаги 1→2→3 в «Дополнительно».\n" + msg,
              uk: "Debian ще не готовий. Натисніть «Встановити Linux».\n" + msg,
              en: "Debian not ready. Tap Install Linux or steps 1→2→3 under Advanced.\n" + msg,
            }[language]
          : msg,
      );
    } finally { setLinuxBusy(false); }
  }, [language]);

  const onLinuxBootstrap = useCallback(async () => {
    setLinuxBusy(true);
    setDebianProgress({ percent: 0, stage: "start", detail: "Подготовка…" });
    setLinuxOutput("Установка Debian (proot-distro)…");
    try {
      const result = await bootstrapDebian((p) => {
        setDebianProgress(p);
        setLinuxOutput(`${p.stage}: ${p.detail}`);
      });
      setLinuxOutput(result.log.slice(-4000) || (result.ok ? "Debian готов" : "Ошибка установки"));
      setLinuxStatus(await getRuntimeFacade().linuxStatus("debian"));
      setMessage(result.ok ? "Debian: готов" : "Debian: ошибка установки");
    } catch (e) {
      setLinuxOutput(e instanceof Error ? e.message : String(e));
      setDebianProgress({ percent: 0, stage: "error", detail: String(e) });
    } finally {
      setLinuxBusy(false);
    }
  }, []);

  const onInstallProotDistro = useCallback(async () => {
    setLinuxBusy(true);
    setDebianProgress({ percent: 5, stage: "pkg", detail: "pkg install proot-distro…" });
    setLinuxOutput("Termux: pkg install proot-distro…");
    try {
      const r = await getRuntimeFacade().userspaceExec(
        "set -o pipefail; pkg install -y proot-distro 2>&1 | tee /tmp/aib-proot-pkg.log | tail -30; echo EXIT:$?",
        { timeoutMs: 600_000 },
      );
      const out = (r.stdout || r.stderr || `exit=${r.exitCode}`).slice(-4000);
      setLinuxOutput(out);
      const ok = await getRuntimeFacade().userspaceExec(
        "command -v proot-distro >/dev/null 2>&1; echo EXIT:$?",
        { timeoutMs: 10_000 },
      );
      const installed = /EXIT:0/.test(ok.stdout || "");
      setDebianProgress({
        percent: installed ? 100 : 0,
        stage: installed ? "pkg_done" : "pkg_fail",
        detail: installed ? "proot-distro установлен" : "proot-distro не найден после install",
      });
      if (!installed && /Testing the available mirrors/i.test(out)) {
        setLinuxOutput(
          out +
            "\n\n→ Зеркала Termux не отвечают. Нажмите «1. Исправить зеркала», затем снова «2. Установить proot-distro».",
        );
      }
      setLinuxStatus(await getRuntimeFacade().linuxStatus("debian"));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setLinuxOutput(
        /RUN_COMMAND|allow-external|SecurityException/i.test(msg)
          ? {
              ru: "Termux не принимает команды. Настройки Termux → allow-external-apps, или кнопка «Разрешить external apps» ниже.\n" + msg,
              uk: "Termux не приймає команди. Увімкніть allow-external-apps.\n" + msg,
              en: "Termux rejects RUN_COMMAND. Enable allow-external-apps.\n" + msg,
            }[language]
          : msg,
      );
    } finally {
      setLinuxBusy(false);
    }
  }, [language]);

  /** pkg hangs on "Testing the available mirrors" → Cloudflare mirror + pkg update. */
  const onFixTermuxMirrors = useCallback(async () => {
    setLinuxBusy(true);
    setDebianProgress({ percent: 10, stage: "mirrors", detail: "Смена зеркал Termux…" });
    setLinuxOutput("Исправление зеркал Termux (Cloudflare packages-cf.termux.dev)…");
    const script = [
      "set -e",
      'PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"',
      'mkdir -p "$PREFIX/etc/apt/sources.list.d"',
      'cat > "$PREFIX/etc/apt/sources.list" << \'EOF\'',
      "deb https://packages-cf.termux.dev/apt/termux-main stable main",
      "EOF",
      'if [ -f "$PREFIX/etc/apt/sources.list.d/root.list" ]; then',
      '  echo "deb https://packages-cf.termux.dev/apt/termux-root root stable" > "$PREFIX/etc/apt/sources.list.d/root.list"',
      "fi",
      'if [ -f "$PREFIX/etc/apt/sources.list.d/x11.list" ]; then',
      '  echo "deb https://packages-cf.termux.dev/apt/termux-x11 x11 main" > "$PREFIX/etc/apt/sources.list.d/x11.list"',
      "fi",
      "pkg clean 2>/dev/null || true",
      "pkg update -y 2>&1 | tail -25",
      "echo MIRRORS_OK",
    ].join("\n");
    try {
      const r = await getRuntimeFacade().userspaceExec(script, { timeoutMs: 300_000 });
      const out = (r.stdout || r.stderr || "").slice(-4000);
      setLinuxOutput(out);
      const ok = /MIRRORS_OK/.test(out);
      setDebianProgress({
        percent: ok ? 100 : 0,
        stage: ok ? "mirrors_ok" : "mirrors_fail",
        detail: ok ? "Зеркала обновлены" : "Не удалось обновить зеркала",
      });
      if (!ok) {
        setLinuxOutput(
          out +
            "\n\nЕсли не помогло: откройте Termux и выполните вручную:\n  termux-change-repo\n  pkg update -y",
        );
      }
    } catch (e) {
      setLinuxOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLinuxBusy(false);
    }
  }, []);

  const onFixAllowExternalApps = useCallback(async () => {
    setLinuxBusy(true);
    setLinuxOutput("Проверка allow-external-apps в Termux…");
    const script = [
      "set -e",
      'PROP="$HOME/.termux/termux.properties"',
      'mkdir -p "$HOME/.termux"',
      'if [ -f "$PROP" ] && grep -q "^allow-external-apps[[:space:]]*=[[:space:]]*true" "$PROP"; then',
      "  echo ALREADY_OK",
      "else",
      '  if [ -f "$PROP" ]; then',
      "    sed -i '/^#\\?allow-external-apps/d' \"$PROP\" 2>/dev/null || true",
      "  fi",
      '  echo "allow-external-apps=true" >> "$PROP"',
      "  echo WROTE_PROP",
      "fi",
      "if command -v termux-reload-settings >/dev/null 2>&1; then",
      "  termux-reload-settings 2>/dev/null || true",
      "  echo RELOADED",
      "fi",
      "echo DONE",
    ].join("\n");
    try {
      const r = await getRuntimeFacade().userspaceExec(script, { timeoutMs: 30_000 });
      const out = (r.stdout || r.stderr || "").slice(-2000);
      setLinuxOutput(
        out +
          "\n\nЕсли RUN_COMMAND всё ещё запрещён: откройте Termux → ~/.termux/termux.properties → allow-external-apps=true → termux-reload-settings → перезапустите AI Builder.",
      );
    } catch (e) {
      setLinuxOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setLinuxBusy(false);
    }
  }, []);


  const onDebianExport = useCallback(async () => {
    setLinuxBusy(true);
    const home = getRuntimeFacade().home?.root || status?.home || "/storage/emulated/0/AIBuilderTermux";
    const dest = debianExportPath.trim() || defaultExportPath(home);
    setDebianExportPath(dest);
    setDebianProgress({ percent: 0, stage: "export", detail: "Экспорт…" });
    try {
      const result = await exportDebian(dest, (p) => {
        setDebianProgress(p);
        setLinuxOutput(`${p.stage}: ${p.detail}`);
      });
      setLinuxOutput(result.log.slice(-4000));
      if (result.path) setDebianExportPath(result.path);
      setMessage(
        result.ok
          ? { ru: `Экспорт: ${result.path || dest}`, uk: `Експорт: ${result.path || dest}`, en: `Export: ${result.path || dest}` }[language]
          : { ru: "Ошибка экспорта", uk: "Помилка експорту", en: "Export failed" }[language],
      );
    } catch (e) {
      setLinuxOutput(e instanceof Error ? e.message : String(e));
    } finally { setLinuxBusy(false); }
  }, [debianExportPath, status?.home, language]);

  const onDebianImport = useCallback(async () => {
    const src = debianImportPath.trim();
    if (!src) {
      setMessage({
          ru: "Укажите путь к архиву .tar.gz",
          uk: "Вкажіть шлях до архіву .tar.gz",
          en: "Enter path to a .tar.gz archive",
        }[language]);
      return;
    }
    setLinuxBusy(true);
    setDebianProgress({
      percent: 0,
      stage: "import",
      detail: { ru: "Импорт…", uk: "Імпорт…", en: "Import…" }[language],
    });
    try {
      const result = await importDebian(src, (p) => {
        setDebianProgress(p);
        setLinuxOutput(`${p.stage}: ${p.detail}`);
      });
      setLinuxOutput(result.log.slice(-4000));
      setLinuxStatus(await getRuntimeFacade().linuxStatus("debian"));
      setMessage(
        result.ok
          ? { ru: "Импорт Debian: OK", uk: "Імпорт Debian: OK", en: "Debian import: OK" }[language]
          : { ru: "Ошибка импорта", uk: "Помилка імпорту", en: "Import failed" }[language],
      );
    } catch (e) {
      setLinuxOutput(e instanceof Error ? e.message : String(e));
    } finally { setLinuxBusy(false); }
  }, [debianImportPath, language]);


  const onBootstrapContinue = useCallback(async (force = false) => {
    setBootBusy(true);
    setBootMsg(
      force
        ? { ru: "Полный перезапуск стадий…", uk: "Повний перезапуск стадій…", en: "Full stage restart…" }[language]
        : { ru: "Продолжение bootstrap…", uk: "Продовження bootstrap…", en: "Resuming bootstrap…" }[language],
    );
    try {
      await withForegroundTask("bootstrap", force ? "Bootstrap (force)" : "Bootstrap", async (update) => {
        const facade = getRuntimeFacade();
        const state = await facade.bootstrapRun({
          force,
          onProgress: (e) => {
            setBootPercent(e.percent);
            setBootMsg(`${e.stageId}: ${e.message}`);
            update(e.percent, `${e.stageId}: ${e.message}`);
            void notifyBootstrapProgress(e.stageId, e.percent, e.message);
          },
        });
        setBootState(state);
        setBootMsg(
          state.lastError ||
            { ru: "Bootstrap завершён", uk: "Bootstrap завершено", en: "Bootstrap finished" }[language],
        );
        setLinuxStatus(await facade.linuxStatus("debian"));
      });
    } catch (e) {
      setBootMsg(e instanceof Error ? e.message : String(e));
    } finally {
      setBootBusy(false);
    }
  }, [language]);

  const onBootstrapReset = useCallback(async () => {
    try {
      const s = await getRuntimeFacade().bootstrapReset();
      setBootState(s);
      setBootPercent(0);
      setBootMsg({
          ru: "Стадии сброшены",
          uk: "Стадії скинуто",
          en: "Stages reset",
        }[language]);
    } catch (e) {
      setBootMsg(e instanceof Error ? e.message : String(e));
    }
  }, [language]);


  const onBackupRefreshList = useCallback(async () => {
    setBackupBusy(true);
    try {
      const list = await getRuntimeFacade().listBackups();
      setBackupList(list || []);
      setMessage(`backups: ${(list || []).length}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  }, []);

  const onBackupCreate = useCallback(async () => {
    setBackupBusy(true);
    try {
      await withForegroundTask("backup", `Backup ${backupScope}`, async () => {
        const facade = getRuntimeFacade();
        const home = facade.home?.root || status?.home || "";
        const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const path = backupPath.trim() || `${home}/backups/manual-${backupScope}-${ts}`;
        setBackupPath(path);
        const man = await createBackup(backupScope, path);
        setMessage(`backup OK · ${man.digest || path}`);
        await onBackupRefreshList();
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  }, [backupPath, backupScope, createBackup, onBackupRefreshList, status?.home]);

  const onBackupVerify = useCallback(async () => {
    const path = backupPath.trim();
    if (!path) return;
    setBackupBusy(true);
    try {
      const plan = await getRuntimeFacade().inspectBackup(path);
      if ((plan as any).ok === false) {
        setBackupInspect(`VERIFY FAIL: ${(plan as any).error}`);
      } else {
        const p = plan as any;
        setBackupInspect(
          `OK · scope=${p.scope || "?"} · files=${p.fileCount ?? p.files ?? "?"} · digest=${(p.digest || "").slice(0, 16)}…`,
        );
      }
    } catch (e) {
      setBackupInspect(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  }, [backupPath]);

  const onBackupRestore = useCallback(async () => {
    const path = backupPath.trim();
    if (!path) return;
    setBackupBusy(true);
    try {
      await withForegroundTask("restore", "Restore backup", async () => {
        await restoreBackup(path);
        setMessage("restore OK (pre-backup of current state was taken if enabled)");
        await onBackupRefreshList();
      });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBackupBusy(false);
    }
  }, [backupPath, restoreBackup, onBackupRefreshList]);


  // Auto: Linux + health + last boot + userspace when screen opens
  useEffect(() => {
    void onLinuxStatus();
    void (async () => {
      try {
        const facade = getRuntimeFacade();
        const [rows, fail, us] = await Promise.all([
          facade.runHealthChecks().catch(() => []),
          facade.lastStartupFailure().catch(() => null),
          facade.initUserspaceRuntime().catch(() => null),
        ]);
        if (Array.isArray(rows) && rows.length) {
          setHealthRows(rows.map((r: any) => ({
            id: r.id,
            level: r.level,
            message: r.message,
            repairable: r.repairable,
          })));
        }
        if (fail) {
          const last = fail.entries?.[fail.entries.length - 1];
          setLastBootInfo(`${fail.finalStage}${last?.message ? " · " + last.message : ""}`);
        }
        if (us) {
          const line = (us.probes || []).map((p: any) => `${p.id}:${p.health}`).join(" · ");
          setUserspaceSnap(`active=${us.activeBackend || "none"} · ${line}`);
        }
        try {
          const bs = await facade.bootstrapState();
          setBootState(bs);
        } catch { /* ignore */ }
        try {
          const fails = await facade.listOpenFailures();
          setFailureRows(
            (fails || []).slice(0, 12).map((f: any) => ({
              id: f.id,
              code: f.code,
              component: f.component,
              message: f.message,
              at: f.at,
            })),
          );
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    })();
  }, [onLinuxStatus]);

  const onContainerCreate = useCallback(async () => {
    setContainerBusy(true);
    try {
      const facade = getRuntimeFacade();
      const instance = await facade.containerCreate({ imageId: "debian:stable", name: `aib-${defaultId}`, projectId: defaultId });
      setContainerId(instance.id);
      await facade.containerStart(instance.id);
      const result = await facade.containerExec(instance.id, "uname", ["-a"]);
      setContainerOutput((result.stdout || result.stderr || `exit=${result.exitCode}`).slice(-3000));
    } catch (e) {
      setContainerOutput(e instanceof Error ? e.message : String(e));
    } finally { setContainerBusy(false); }
  }, [defaultId]);

  const onWorkspaceBuild = useCallback(async () => {
    if (!containerId) return;
    setWorkspaceBuildBusy(true);
    try {
      const result = await getRuntimeFacade().runAIWorkspaceBuild(containerId, { template: "node", install: true, build: false, test: false, timeoutMs: 5 * 60_000 });
      setWorkspaceBuildOutput(JSON.stringify({ ok: result.ok, failedStep: result.failedStep, steps: result.steps.map((x) => ({ name: x.name, ok: x.ok, exitCode: x.exitCode })) }, null, 2));
    } catch (e) { setWorkspaceBuildOutput(e instanceof Error ? e.message : String(e)); }
    finally { setWorkspaceBuildBusy(false); }
  }, [containerId]);

  const onProjectGenerate = useCallback(async () => {
    if (!containerId) return;
    setProjectGenerateBusy(true);
    try {
      const result = await getRuntimeFacade().generateAIProject(containerId, {
        name: `aib-${defaultId}`,
        goal: "Создать минимальный проект, который можно собрать и протестировать внутри Linux workspace.",
        template: "node",
        runWorkflow: true,
        build: true,
        test: true,
      });
      setProjectGenerateOutput(JSON.stringify({ ok: result.ok, name: result.name, template: result.template, files: result.files, failedStep: result.build?.failedStep }, null, 2));
    } catch (e) { setProjectGenerateOutput(e instanceof Error ? e.message : String(e)); }
    finally { setProjectGenerateBusy(false); }
  }, [containerId, defaultId]);

  const onCodingAgent = useCallback(async () => {
    if (!containerId) return;
    setCodingAgentBusy(true);
    try {
      const result = await getRuntimeFacade().runAICodingAgent(containerId, {
        name: `aib-${defaultId}`,
        goal: "Проверить и улучшить минимальный проект внутри Linux workspace, затем собрать и протестировать его.",
        template: "node",
        maxIterations: 3,
        build: true,
        test: true,
      });
      setCodingAgentOutput(JSON.stringify({ ok: result.ok, iterations: result.iterations.map((x) => ({ iteration: x.iteration, summary: x.plan.summary, ok: x.build?.ok, failedStep: x.build?.failedStep })), changedFiles: result.changedFiles, error: result.error }, null, 2));
    } catch (e) { setCodingAgentOutput(e instanceof Error ? e.message : String(e)); }
    finally { setCodingAgentBusy(false); }
  }, [containerId, defaultId]);

  const onContainerStop = useCallback(async () => {
    if (!containerId) return;
    setContainerBusy(true);
    try { await getRuntimeFacade().containerStop(containerId); setContainerOutput("Container stopped"); }
    catch (e) { setContainerOutput(e instanceof Error ? e.message : String(e)); }
    finally { setContainerBusy(false); }
  }, [containerId]);

  const onContainerRemove = useCallback(async () => {
    if (!containerId) return;
    setContainerBusy(true);
    try { await getRuntimeFacade().containerRemove(containerId); setContainerId(null); setContainerOutput("Container removed; project files are preserved"); }
    catch (e) { setContainerOutput(e instanceof Error ? e.message : String(e)); }
    finally { setContainerBusy(false); }
  }, [containerId]);

  const onConnectDevice = useCallback(async () => {
    setDeviceBusy(true);
    setDeviceOutput("");
    try {
      const listed = await adbListDevices();
      setAdbDevicesText(
        (listed.devices || []).map((d) => `${d.serial}  ${d.state}`).join("\n") || listed.message,
      );
      const facade = getRuntimeFacade();
      const bridge = facade.createTermuxAdbDeviceBridge();
      facade.useDeviceBridge(bridge);
      const available = listed.ok || (await bridge.isAvailable());
      setDeviceAvailable(available);
      if (available) {
        await startDeviceWatchdog();
        setDeviceOutput(listed.message || "ADB device connected");
      } else {
        setDeviceOutput(listed.message + (listed.detail ? "\n" + listed.detail : ""));
      }
      await refresh();
    } catch (e) {
      setDeviceAvailable(false);
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally { setDeviceBusy(false); }
  }, [refresh]);

  const onAdbPair = useCallback(async () => {
    if (!adbPairHost.trim() || !adbPairCode.trim()) {
      setDeviceOutput(
        {
          ru: "Укажите IP:порт сопряжения и 6-значный код с экрана «Пара»",
          uk: "Вкажіть IP:порт спарювання та 6-значний код",
          en: "Enter pairing IP:port and the 6-digit code from the Pair screen",
        }[language],
      );
      return;
    }
    setDeviceBusy(true);
    try {
      const r = await adbPair(adbPairHost, adbPairCode);
      setDeviceOutput(r.message + (r.detail ? "\n" + r.detail : ""));
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally { setDeviceBusy(false); }
  }, [adbPairHost, adbPairCode, language]);

  const onAdbConnect = useCallback(async () => {
    if (!adbConnectHost.trim() || !adbConnectHost.includes(":")) {
      setDeviceOutput(
        {
          ru: "Укажите IP:порт подключения (не порт pair), например 192.168.1.10:5555",
          uk: "Вкажіть IP:порт підключення (не порт pair)",
          en: "Enter connect IP:port (not the pair port), e.g. 192.168.1.10:5555",
        }[language],
      );
      return;
    }
    setDeviceBusy(true);
    try {
      const r = await adbConnect(adbConnectHost);
      setDeviceOutput(r.message + (r.detail ? "\n" + r.detail : ""));
      setAdbDevicesText(
        (r.devices || []).map((d) => `${d.serial}  ${d.state}`).join("\n") || "",
      );
      setDeviceAvailable(r.ok);
      if (r.ok) {
        const facade = getRuntimeFacade();
        const bridge = facade.createTermuxAdbDeviceBridge();
        facade.useDeviceBridge(bridge);
        await startDeviceWatchdog();
      }
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally { setDeviceBusy(false); }
  }, [adbConnectHost, language]);

  const onDeviceLogcat = useCallback(async () => {
    try {
      const facade = getRuntimeFacade();
      // Ensure Termux ADB bridge is wired (list devices does this; logcat alone may not)
      try {
        const bridge = facade.createTermuxAdbDeviceBridge();
        facade.useDeviceBridge(bridge);
      } catch { /* keep existing bridge */ }
      const result = await facade.device.logcat(["-d", "-t", "120"]);
      const body = (result.stdout || result.stderr || "").slice(-12000);
      if (result.exitCode !== 0 && /DEVICE_BRIDGE_UNAVAILABLE|not found|no devices/i.test(body || "")) {
        setDeviceOutput(
          {
            ru: "Logcat недоступен: сначала Pair/Connect или «Обновить устройства». Нужны android-tools в Termux.",
            uk: "Logcat недоступний: спочатку Pair/Connect.",
            en: "Logcat unavailable: Pair/Connect first (android-tools in Termux).",
          }[language] + (body ? "\n" + body : ""),
        );
      } else {
        setDeviceOutput(body || "logcat: empty");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/unavailable|DEVICE_UNAVAILABLE|no devices|not found|ADB_/i.test(msg)) {
        setDeviceOutput(
          {
            ru: "Logcat недоступен: сначала Pair/Connect или «Обновить устройства». Нужны android-tools в Termux и устройство в adb devices.",
            uk: "Logcat недоступний: спочатку Pair/Connect. Потрібні android-tools у Termux.",
            en: "Logcat unavailable: Pair/Connect first (android-tools in Termux, device in adb devices).",
          }[language] + "\n" + msg,
        );
      } else {
        setDeviceOutput(msg);
      }
    }
  }, [language]);

  const onRunAutonomousDeviceLoop = useCallback(async () => {
    const packageName = devicePackageName.trim() || undefined;
    if (!deviceGoal.trim()) { setDeviceOutput("Enter AI device test goal first"); return; }
    setDeviceLoopBusy(true);
    setDeviceOutput("AI device loop: starting…");
    try {
      const result = await runDeviceDevelopmentLoop({
        packageName,
        goal: deviceGoal.trim(),
        maxBuildAttempts: 3,
        maxDeviceSteps: 8,
        onEvent: (event) => {
          if (event.type === "build_started") setDeviceOutput(`Build ${event.attempt}/${event.maxAttempts}…`);
          else if (event.type === "build_failed") {
            setDeviceOutput(`Build ${event.attempt} failed — AI repair…`);
            void notePossibleBuildKill(`device-loop-build-${event.attempt}`);
            void maybeSurvivalReminder(language as "ru" | "uk" | "en").then((m) => {
              if (m) setMessage(m);
            });
          }
          else if (event.type === "device_started") setDeviceOutput(`APK ready. Device test ${event.attempt}…`);
          else if (event.type === "device_finished") setDeviceOutput(`Device: ${event.result.reason}`);
          else if (event.type === "repair_started") setDeviceOutput(`AI repair ${event.attempt}…`);
          else if (event.type === "completed") setDeviceOutput("AI device loop: test passed ✓");
          else if (event.type === "failed") setDeviceOutput(`AI device loop: ${event.reason}`);
        },
      });
      setDeviceOutput(result.completed
        ? `AI device loop completed: goal reached after ${result.buildAttempts} build attempt(s).`
        : `AI device loop stopped: ${result.device?.reason || result.build?.errors?.[0]?.message || "unknown failure"}`);
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviceLoopBusy(false);
      await refresh();
    }
  }, [devicePackageName, deviceGoal, runDeviceDevelopmentLoop, refresh]);


  const onRunDeviceSuite = useCallback(async () => {
    if (!project) { setDeviceOutput("Bind an active project first"); return; }
    if (!deviceApkPath.trim() || !deviceGoal.trim()) { setDeviceOutput("APK path and test specification are required"); return; }
    setDeviceSuiteBusy(true);
    setDeviceOutput("AI Test Planner: generating suite…");
    try {
      const result = await getRuntimeFacade().runDeviceTestSuite({
        apkPath: deviceApkPath.trim(),
        packageName: devicePackageName.trim() || undefined,
        goal: deviceGoal.trim(),
        projectPath: project.path,
        runId: `suite-${Date.now()}`,
      });
      const t = result.report.totals;
      setDeviceOutput(`AI Test Suite: ${result.report.status.toUpperCase()} · ${t.passed}/${t.cases} passed · evidence: ${result.report.evidenceRoot}`);
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviceSuiteBusy(false);
      await refresh();
    }
  }, [project, deviceApkPath, devicePackageName, deviceGoal, refresh]);

  const onRunSelfHealingQA = useCallback(async () => {
    if (!project) { setDeviceOutput("Bind an active project first"); return; }
    if (!deviceGoal.trim()) { setDeviceOutput("Test specification is required"); return; }
    setDeviceSelfHealBusy(true);
    setDeviceOutput("AI Self-Healing QA: build → test → evidence → repair…");
    try {
      const result = await runSelfHealingDeviceQA({
        packageName: devicePackageName.trim() || undefined,
        goal: deviceGoal.trim(),
        maxBuildAttempts: 3,
        maxActionsPerCase: 12,
        onEvent: (event) => {
          if (event.type === "suite_planned") setDeviceOutput(`AI QA: planned ${event.cases} test case(s)`);
          else if (event.type === "build_started") setDeviceOutput(`AI QA: build ${event.attempt}/${event.maxAttempts}…`);
          else if (event.type === "suite_started") setDeviceOutput(`AI QA: running ${event.caseIds?.length ? event.caseIds.join(", ") : "full suite"}…`);
          else if (event.type === "suite_finished") setDeviceOutput(`AI QA: ${event.run.report.status.toUpperCase()} · ${event.run.report.totals.passed}/${event.run.report.totals.cases} passed`);
          else if (event.type === "repair_started") setDeviceOutput(`AI QA: repairing ${event.failedCases.join(", ") || "build"}…`);
          else if (event.type === "repair_finished") setDeviceOutput("AI QA: repair applied, rebuilding…");
          else if (event.type === "completed") setDeviceOutput(`AI Self-Healing QA passed after ${event.attempt} attempt(s) ✓`);
          else if (event.type === "failed") setDeviceOutput(`AI Self-Healing QA stopped: ${event.reason}`);
        },
      });
      const report = result.finalRun?.report;
      setDeviceOutput(result.completed
        ? `AI Self-Healing QA: PASSED · ${report?.totals.passed || 0}/${report?.totals.cases || 0} cases · repaired: ${result.repairedCaseIds.length}`
        : `AI Self-Healing QA: FAILED · ${report?.totals.passed || 0}/${report?.totals.cases || 0} cases · repaired: ${result.repairedCaseIds.join(", ") || "none"}`);
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviceSelfHealBusy(false);
      await refresh();
    }
  }, [project, deviceGoal, devicePackageName, runSelfHealingDeviceQA, refresh]);

  const onRunReleaseGate = useCallback(async () => {
    if (!project) { setDeviceOutput("Bind an active project first"); return; }
    if (!deviceGoal.trim()) { setDeviceOutput("Release test specification is required"); return; }
    setDeviceReleaseGateBusy(true);
    setDeviceOutput("AI Release Gate: build → sign → regression…");
    try {
      const result = await runAIReleaseGate({
        packageName: devicePackageName.trim() || undefined,
        goal: deviceGoal.trim(),
        requireDeviceRegression: true,
        maxActionsPerCase: 12,
      });
      setDeviceOutput(result.releaseAllowed
        ? `Release Gate: ALLOWED · APK: ${result.artifact}`
        : `Release Gate: BLOCKED · ${result.checks.map((c) => `${c.id}:${c.status}`).join(" · ")}`);
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviceReleaseGateBusy(false);
      await refresh();
    }
  }, [project, deviceGoal, devicePackageName, runAIReleaseGate, refresh]);

  const onRunReleaseArtifact = useCallback(async () => {
    if (!project) { setDeviceOutput("Bind an active project first"); return; }
    if (!deviceGoal.trim()) { setDeviceOutput("Release test specification is required"); return; }
    setDeviceReleaseArtifactBusy(true);
    setDeviceOutput("AI Release Bundle: gate → manifest → checksums → zip…");
    try {
      const result = await runAIReleaseArtifact({
        packageName: devicePackageName.trim() || undefined,
        goal: deviceGoal.trim(),
        requireDeviceRegression: true,
        maxActionsPerCase: 12,
        releaseName: `v${getRuntimeFacade().runtimeIdentity.runtimeVersion}-${Date.now()}`,
      });
      setDeviceOutput(result.created
        ? `Release Bundle: READY · ${result.bundleArchive || result.bundleZip} · SHA256: ${result.sha256}`
        : `Release Bundle: NOT CREATED · ${result.message}`);
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally {
      setDeviceReleaseArtifactBusy(false);
      await refresh();
    }
  }, [project, deviceGoal, devicePackageName, runAIReleaseArtifact, refresh]);

  const onPublishReleaseChannel = useCallback(async () => {
    if (!deviceGoal.trim()) { setDeviceOutput("Release test specification is required"); return; }
    setDeviceReleaseChannelBusy(true);
    setDeviceOutput(`AI Release Channel: gate → artifact → ${deviceReleaseChannel}…`);
    try {
      const result = await runAIReleaseChannel({ packageName: devicePackageName.trim() || undefined, goal: deviceGoal, channel: deviceReleaseChannel as any });
      setDeviceOutput(result.published ? `Channel ${result.channel}: PUBLISHED · ${result.entry?.versionName} (${result.entry?.versionCode}) · ${result.entry?.apkPath}` : `Channel ${result.channel}: BLOCKED · ${result.message}`);
      refresh();
    } catch (e) { setDeviceOutput(`Release Channel error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceReleaseChannelBusy(false); }
  }, [deviceGoal, devicePackageName, deviceReleaseChannel, runAIReleaseChannel, refresh]);

  const onRollbackReleaseChannel = useCallback(async () => {
    setDeviceRollbackBusy(true);
    setDeviceOutput(`AI Rollback: ${deviceReleaseChannel}…`);
    try {
      const result = await runAIRollbackReleaseChannel({ channel: deviceReleaseChannel as any });
      setDeviceOutput(result.rolledBack ? `Rollback ${result.channel}: ${result.entry?.releaseId} · version ${result.entry?.versionName} (${result.entry?.versionCode})` : `Rollback ${result.channel}: ${result.message}`);
      refresh();
    } catch (e) { setDeviceOutput(`Rollback error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceRollbackBusy(false); }
  }, [deviceReleaseChannel, runAIRollbackReleaseChannel, refresh]);


  const onProductionDeploy = useCallback(async () => {
    setDeviceDeployBusy(true);
    setDeviceOutput(`AI Production Deploy: ${deviceReleaseChannel} → install → health-check → rollback if needed…`);
    try {
      const result = await runAIProductionDeployment({ channel: deviceReleaseChannel as any, packageName: devicePackageName.trim() || undefined, autoRollback: true, healthTimeoutMs: 8000, confirmation: fleetConfirmation, backupSecret: fleetBackupSecret || undefined, backupRetention: 5 });
      setDeviceOutput(result.deployed
        ? `Deployment ${result.channel}: HEALTHY · ${result.entry?.versionName} (${result.entry?.versionCode}) · ${result.packageName}`
        : result.rolledBack
          ? `Deployment ${result.channel}: AUTO-ROLLBACK · restored ${result.rollbackEntry?.versionName} (${result.rollbackEntry?.versionCode}) · ${result.rollbackHealth?.detail}`
          : `Deployment ${result.channel}: FAILED · ${result.message}`);
      refresh();
    } catch (e) { setDeviceOutput(`Deployment error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceDeployBusy(false); }
  }, [devicePackageName, deviceReleaseChannel, runAIProductionDeployment, refresh]);

  const onFleetDeploy = useCallback(async () => {
    setDeviceDeployBusy(true);
    setDeviceOutput(`AI Device Fleet: ${deviceReleaseChannel} → rollout → health-check → per-device rollback…`);
    try {
      const result = await runAIDeviceFleetDeployment({ channel: deviceReleaseChannel as any, packageName: devicePackageName.trim() || undefined, concurrency: 2, autoRollback: true, healthTimeoutMs: 8000, confirmation: fleetConfirmation });
      setDeviceOutput(`Fleet ${result.channel}: ${result.healthy}/${result.total} healthy · ${result.rolledBack} rollback · ${result.failed} failed`);
    } catch (e) { setDeviceOutput(`Fleet deployment error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceDeployBusy(false); refresh(); }
  }, [devicePackageName, deviceReleaseChannel, runAIDeviceFleetDeployment, refresh]);

  const onFleetCanary = useCallback(async () => {
    setDeviceDeployBusy(true);
    setDeviceOutput(`AI Fleet Canary: ${deviceReleaseChannel} → 10% → 25% → 100% with failure gates…`);
    try {
      const result = await runAIFleetCanary({ channel: deviceReleaseChannel as any, packageName: devicePackageName.trim() || undefined, concurrency: 2, autoRollback: true, healthTimeoutMs: 8000, confirmation: fleetConfirmation });
      setDeviceOutput(result.stopped
        ? `Canary ${result.channel}: STOPPED · ${result.stopReason} · ${result.healthy}/${result.attempted} healthy`
        : `Canary ${result.channel}: COMPLETE · ${result.healthy}/${result.attempted} healthy`);
    } catch (e) { setDeviceOutput(`Fleet canary error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceDeployBusy(false); refresh(); }
  }, [devicePackageName, deviceReleaseChannel, runAIFleetCanary, refresh]);

  const onFleetCommandCenter = useCallback(async () => {
    setFleetCommandBusy(true);
    try {
      const result = await runAIFleetCommandCenter({ channel: deviceReleaseChannel as any });
      setFleetSnapshot(result);
      const healthy = result.devices.filter((d: any) => d.status === "healthy").length;
      setDeviceOutput(`Fleet Command Center: ${result.channel} · ${healthy}/${result.devices.length} healthy · ${result.observability.status.toUpperCase()} · incidents ${result.observability.incidentCount}`);
    } catch (e) { setDeviceOutput(`Fleet command center error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFleetCommandBusy(false); refresh(); }
  }, [deviceReleaseChannel, runAIFleetCommandCenter, refresh]);

  const onFleetDeviceCommand = useCallback(async (serial: string, action: "deploy" | "rollback") => {
    setFleetCommandBusy(true);
    try {
      const result = await runAIFleetDeviceCommand({ channel: deviceReleaseChannel as any, serial, packageName: devicePackageName.trim() || undefined, action, confirmation: fleetConfirmation });
      setDeviceOutput(`${action.toUpperCase()} ${serial}: ${result.message}`);
      const snapshot = await runAIFleetCommandCenter({ channel: deviceReleaseChannel as any });
      setFleetSnapshot(snapshot);
    } catch (e) { setDeviceOutput(`Fleet device command error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFleetCommandBusy(false); refresh(); }
  }, [devicePackageName, deviceReleaseChannel, runAIFleetDeviceCommand, runAIFleetCommandCenter, refresh]);

  const onFleetPolicy = useCallback(async () => {
    try {
      const result = await runAIFleetPolicy();
      setFleetPolicy(result);
      setFleetRole(result.role);
      setFleetConfirmation(result.productionConfirmationPhrase);
      setDeviceOutput(`Fleet Policy: ${result.role} · production confirmation ${result.requireProductionConfirmation ? "ON" : "OFF"}`);
    } catch (e) { setDeviceOutput(`Fleet policy error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [runAIFleetPolicy]);

  const onSaveFleetPolicy = useCallback(async () => {
    setFleetCommandBusy(true);
    try {
      const result = await setAIFleetPolicy({ role: fleetRole as any, requireProductionConfirmation: true, productionConfirmationPhrase: fleetConfirmation });
      setFleetPolicy(result);
      setDeviceOutput(`Fleet Policy saved: ${result.role} · audit enabled`);
    } catch (e) { setDeviceOutput(`Fleet policy save error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFleetCommandBusy(false); refresh(); }
  }, [fleetConfirmation, fleetRole, setAIFleetPolicy, refresh]);

  const onFleetBackupCreate = useCallback(async () => {
    if (!fleetBackupSecret || fleetBackupSecret.length < 12) return;
    setFleetCommandBusy(true);
    try {
      const result = await runAICreateFleetBackup({ secret: fleetBackupSecret, channel: deviceReleaseChannel as any, retention: 5, reason: "manual" });
      setFleetBackups(await runAIListFleetBackups({ limit: 10 }));
      Alert.alert("Fleet Backup", `Created ${result.id}`);
    } catch (error) { Alert.alert("Fleet Backup", error instanceof Error ? error.message : String(error)); }
    finally { setFleetCommandBusy(false); }
  }, [deviceReleaseChannel, fleetBackupSecret, runAICreateFleetBackup, runAIListFleetBackups]);

  const onFleetBackupVerify = useCallback(async () => {
    if (!fleetBackupSecret || !fleetBackups[0]?.id) return;
    setFleetCommandBusy(true);
    try { const result = await runAIVerifyFleetBackup({ backupId: fleetBackups[0].id, secret: fleetBackupSecret }); Alert.alert("Fleet Backup", result.valid ? "Integrity OK" : `Invalid: ${result.reason}`); }
    catch (error) { Alert.alert("Fleet Backup", error instanceof Error ? error.message : String(error)); }
    finally { setFleetCommandBusy(false); }
  }, [fleetBackupSecret, fleetBackups, runAIVerifyFleetBackup]);

  const onFleetRecoveryDrill = useCallback(async () => {
    if (!fleetBackupSecret || fleetBackupSecret.length < 12) return;
    setFleetCommandBusy(true);
    try {
      const result = await runAIFleetRecoveryDrill({ secret: fleetBackupSecret, backupId: fleetBackups[0]?.id });
      Alert.alert("Recovery Drill", `${result.status} · ${result.files} files · ${result.failureReason || "isolated restore verified"}`);
    } catch (error) { Alert.alert("Recovery Drill", error instanceof Error ? error.message : String(error)); }
    finally { setFleetCommandBusy(false); }
  }, [fleetBackupSecret, fleetBackups, runAIFleetRecoveryDrill]);

  const onFleetRecoverySchedule = useCallback(async () => {
    try { const result = await runAIFleetRecoverySchedule(deviceReleaseChannel as any); setFleetRecoveryScheduleState(result); const slo = await runAIFleetRecoverySlo(deviceReleaseChannel as any); setFleetRecoverySlo(slo); Alert.alert("Recovery SLO", `${slo.status} · backup ${slo.backupFresh ? "fresh" : "stale"} · drill ${slo.drillFresh ? "fresh" : "stale"}`); }
    catch (error) { Alert.alert("Recovery Scheduler", error instanceof Error ? error.message : String(error)); }
  }, [deviceReleaseChannel, runAIFleetRecoverySchedule, runAIFleetRecoverySlo]);

  const onFleetUnifiedControlCenter = useCallback(async () => {
    setFleetCommandBusy(true);
    try {
      const result = await runAIFleetUnifiedControlCenter({ channel: deviceReleaseChannel as any });
      setFleetUnifiedControl(result);
      setDeviceOutput(`Control Center: ${result.status.toUpperCase()} · devices ${result.summary.healthyDevices}/${result.summary.devices} healthy · incidents ${result.summary.openIncidents} · alerts ${result.summary.activeAlerts} · critical ${result.summary.criticalAlerts}`);
    } catch (error) { setDeviceOutput(`Control Center error: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setFleetCommandBusy(false); }
  }, [deviceReleaseChannel, runAIFleetUnifiedControlCenter]);

  const onFleetSloDashboard = useCallback(async () => {
    setDeviceDeployBusy(true);
    try {
      const result = await runAIFleetSloDashboard({ channel: deviceReleaseChannel as any });
      setFleetSloDashboard(result);
      setDeviceOutput(`Fleet SLO: ${result.overallStatus.toUpperCase()} · failure ${result.metrics.failureRate.toFixed(1)}% · open incidents ${result.metrics.openIncidentCount} · backup ${result.metrics.backupFresh ? "fresh" : "STALE"} · drill ${result.metrics.drillFresh ? "fresh" : "STALE"}`);
    } catch (error) { setDeviceOutput(`Fleet SLO dashboard error: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setDeviceDeployBusy(false); }
  }, [deviceReleaseChannel, runAIFleetSloDashboard]);

  const onFleetAlertEscalation = useCallback(async () => {
    setDeviceDeployBusy(true);
    try {
      const result = await runAIFleetAlertEscalation({ channel: deviceReleaseChannel as any });
      setFleetEscalation(result);
      setDeviceOutput(`Fleet alerts: ${result.escalatedCount} active · ${result.acknowledgedCount} acknowledged · outbox ${result.pendingNotifications}`);
    } catch (error) { setDeviceOutput(`Fleet escalation error: ${error instanceof Error ? error.message : String(error)}`); }
    finally { setDeviceDeployBusy(false); }
  }, [deviceReleaseChannel, runAIFleetAlertEscalation]);

  const onFleetSloAcknowledge = useCallback(async (item: any) => {
    try {
      if (item.incidentId) await acknowledgeAIFleetDashboardIncident({ channel: deviceReleaseChannel as any, incidentId: item.incidentId });
      else await acknowledgeAIFleetDashboardAlert({ channel: deviceReleaseChannel as any, alertId: item.id });
      const result = await runAIFleetSloDashboard({ channel: deviceReleaseChannel as any });
      setFleetSloDashboard(result);
    } catch (error) { setDeviceOutput(`Acknowledge error: ${error instanceof Error ? error.message : String(error)}`); }
  }, [deviceReleaseChannel, acknowledgeAIFleetDashboardAlert, acknowledgeAIFleetDashboardIncident, runAIFleetSloDashboard]);

  const onFleetRecoveryScheduledRun = useCallback(async () => {
    if (!fleetBackupSecret || fleetBackupSecret.length < 12) return;
    setFleetCommandBusy(true);
    try { const result = await runAIScheduledFleetRecovery({ secret: fleetBackupSecret, channel: deviceReleaseChannel as any, reason: "runtime-scheduled-recovery" }); setFleetRecoveryScheduleState(result.schedule); setFleetRecoverySlo(result.slo); setFleetBackups(await runAIListFleetBackups({ limit: 10 })); Alert.alert("Scheduled Recovery", `${result.drill.status} · SLO ${result.slo.status}`); }
    catch (error) { Alert.alert("Scheduled Recovery", error instanceof Error ? error.message : String(error)); }
    finally { setFleetCommandBusy(false); }
  }, [deviceReleaseChannel, fleetBackupSecret, runAIScheduledFleetRecovery, runAIListFleetBackups]);

  const onFleetBackupRestore = useCallback(async () => {
    if (!fleetBackupSecret || !fleetBackups[0]?.id) return;
    setFleetCommandBusy(true);
    try { const result = await runAIRestoreFleetBackup({ backupId: fleetBackups[0].id, secret: fleetBackupSecret }); Alert.alert("Fleet Backup", `Restored ${result.snapshotId}`); }
    catch (error) { Alert.alert("Fleet Backup", error instanceof Error ? error.message : String(error)); }
    finally { setFleetCommandBusy(false); }
  }, [fleetBackupSecret, fleetBackups, runAIRestoreFleetBackup]);

  const onFleetAudit = useCallback(async () => {
    try {
      const entries = await runAIFleetAudit({ limit: 12 });
      setDeviceOutput(entries.length ? `Audit: ${entries.slice(-6).map((x: any) => `${x.action}/${x.channel}/${x.result}${x.serial ? `/${x.serial}` : ""}`).join(" · ")}` : "Audit: no entries");
    } catch (e) { setDeviceOutput(`Fleet audit error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [runAIFleetAudit]);

  const onFleetAuditSecurity = useCallback(async () => {
    try {
      const verification = await runAIVerifyFleetAudit();
      const entries = await runAISecureFleetAudit({ limit: 12 });
      setDeviceOutput(`Secure Audit: ${verification.valid ? "VALID" : "TAMPERED"} · ${verification.entries} chained entries${entries.length ? ` · latest ${entries.slice(-3).map((x: any) => `${x.action}/${x.channel}/${x.result}`).join(" · ")}` : ""}`);
    } catch (e) { setDeviceOutput(`Secure audit error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [runAIVerifyFleetAudit, runAISecureFleetAudit]);

  const onFleetSnapshot = useCallback(async () => {
    try {
      const result = await runAICreateFleetSnapshot();
      setDeviceOutput(`Fleet snapshot: ${result.id} · ${result.files.length} files · ${result.manifestSha256.slice(0, 16)}…`);
    } catch (e) { setDeviceOutput(`Fleet snapshot error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [runAICreateFleetSnapshot]);

  const onFleetRecovery = useCallback(async () => {
    try {
      const result = await runAIRestoreFleetSnapshot();
      setDeviceOutput(`Fleet recovery: ${result.restored ? "RESTORED" : "FAILED"} · ${result.snapshotId} · ${result.files} files`);
      const snapshot = await runAIFleetCommandCenter({ channel: deviceReleaseChannel as any });
      setFleetSnapshot(snapshot);
    } catch (e) { setDeviceOutput(`Fleet recovery error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [deviceReleaseChannel, runAIRestoreFleetSnapshot, runAIFleetCommandCenter]);

  const onFleetAuditExport = useCallback(async () => {
    try {
      const result = await runAIExportFleetAuditBundle({ channel: deviceReleaseChannel as any });
      setDeviceOutput(`Fleet audit bundle: ${result.path} · chain ${result.verification.valid ? "VALID" : "INVALID"}`);
    } catch (e) { setDeviceOutput(`Audit bundle error: ${e instanceof Error ? e.message : String(e)}`); }
  }, [deviceReleaseChannel, runAIExportFleetAuditBundle]);

  const onFleetObservability = useCallback(async () => {
    setDeviceDeployBusy(true);
    setDeviceOutput(`AI Fleet Observability: ${deviceReleaseChannel}…`);
    try {
      const result = await runAIFleetObservability({ channel: deviceReleaseChannel as any });
      const stages = result.canary?.stages.map(s => `#${s.stage} ${s.percentage}% ${s.failureRate.toFixed(1)}% ${s.passed ? "PASS" : "STOP"}`).join(" · ") || "no canary stages";
      setDeviceOutput(`Fleet ${result.channel}: ${result.status.toUpperCase()} · ${result.healthy}/${result.attempted || 0} healthy · failure ${result.failureRate.toFixed(1)}% · incidents ${result.incidentCount}\n${stages}`);
    } catch (e) { setDeviceOutput(`Fleet observability error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setDeviceDeployBusy(false); refresh(); }
  }, [deviceReleaseChannel, runAIFleetObservability, refresh]);

  const onStopDevice = useCallback(async () => {
    await stopDeviceWatchdog();
    setDeviceAvailable(false);
    setDeviceOutput("Device watchdog stopped");
  }, []);

  const onRunDeviceLoop = useCallback(async () => {

    setDeviceBusy(true);
    try {
      const result = await getRuntimeFacade().runDeviceAppLoop({
        apkPath: deviceApkPath.trim(),
        packageName: devicePackageName.trim() || undefined,
        screenshot: true,
        screenshotPath: "/storage/emulated/0/Download/AIBuilder-device.png",
        settleMs: 1000,
      });
      setDeviceOutput([
        "DEVICE_APP_LOOP_OK",
        `install=${result.installed.exitCode}`,
        `launch=${result.launched.exitCode}`,
        `screenshot=${result.screenshotPath || "captured"}`,
        `screenshotBase64=${result.screenshotBase64 ? result.screenshotBase64.length + " chars" : "none"}`,
        result.logcat?.stderr ? `logcat=${result.logcat.stderr}` : "logcat=collected",
      ].join("\n"));
    } catch (e) {
      setDeviceOutput(e instanceof Error ? e.message : String(e));
    } finally { setDeviceBusy(false); }
  }, [deviceApkPath, devicePackageName]);

  const onBindActive = useCallback(async () => {
    if (!project) {
      setMessage(
        {
          ru: "Нет активного проекта — откройте проект или укажите ID выше",
          uk: "Немає активного проєкту",
          en: "No active project — open one or set Project ID above",
        }[language],
      );
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const binding = await bindProjectToRuntime(getRuntimeFacade(), project.id, {
        launchUbuntu: false,
      });
      setProjectId(project.id);
      setMessage(`bound:${binding.session.id} · ${project.path}`);
      await refresh();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [project, refresh, language]);

  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={{
        padding: 16,
        paddingBottom: insets.bottom + 24,
        gap: 12,
      }}
    >
      <View style={styles.headerRow}>
        <Text style={[styles.title, { color: colors.inkBright }]}>
          {t("runtime")}
        </Text>
        <TouchableOpacity
          onPress={() => void refresh()}
          style={[styles.btn, { borderColor: colors.line, backgroundColor: colors.surface }]}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <Ionicons name="refresh" size={18} color={colors.accent} />
          )}
        </TouchableOpacity>
      </View>

      {error ? (
        <Text style={{ color: colors.danger ?? "#f66" }}>{error}</Text>
      ) : null}

      {message ? (
        <Text style={{ color: colors.muted }}>{message}</Text>
      ) : null}

      {/* ===== SIMPLE: environment at a glance ===== */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.inkBright }]}>
          {{ ru: "Что работает", uk: "Що працює", en: "Status" }[language]}
        </Text>
        <Text style={[styles.helpText, { marginBottom: 10 }]}>
          {{
            ru: "Зелёный — готово. Красный — нужно действие. Обычная сборка APK идёт через Termux; Linux нужен только для полного Debian.",
            uk: "Зелений — готово. Червоний — потрібна дія. APK збирається через Termux; Linux — лише для Debian.",
            en: "Green = ready. Red = action needed. APK builds use Termux; Linux is only for full Debian.",
          }[language]}
        </Text>

        {(() => {
          const termuxOk = linuxStatus != null; // after check we know bridge works if any status returned
          const prootOk = !!(linuxStatus && linuxStatus.prootDistroInstalled);
          const debianOk = !!(linuxStatus && linuxStatus.available);
          const busy = linuxBusy || bootBusy;
          const row = (label: string, ok: boolean | null, hint: string) => (
            <View
              key={label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 10,
                gap: 10,
              }}
            >
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor:
                    ok === null ? colors.muted : ok ? (colors.success || colors.accent) : (colors.danger || "#f66"),
                }}
              />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.inkBright, fontSize: 15, fontWeight: "600" }}>{label}</Text>
                <Text style={{ color: colors.muted, fontSize: 12 }}>{hint}</Text>
              </View>
              <Text
                style={{
                  color: ok === null ? colors.muted : ok ? (colors.success || colors.accent) : (colors.danger || "#f66"),
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {ok === null ? "…" : ok ? "OK" : "—"}
              </Text>
            </View>
          );
          return (
            <View>
              {row(
                "Termux",
                /RUN_COMMAND|allow-external-apps|SecurityException/i.test(linuxOutput || "")
                  ? false
                  : linuxStatus == null && !busy
                    ? null
                    : true,
                {
                  ru: "Связь с терминалом на телефоне",
                  uk: "Зв'язок з терміналом",
                  en: "Link to on-device terminal",
                }[language],
              )}
              {row(
                "proot-distro",
                linuxStatus == null ? null : prootOk,
                {
                  ru: "Нужен, чтобы поставить Linux",
                  uk: "Потрібен, щоб поставити Linux",
                  en: "Required to install Linux",
                }[language],
              )}
              {row(
                "Linux (Debian)",
                linuxStatus == null ? null : debianOk,
                {
                  ru: "Полноценный Linux в контейнере",
                  uk: "Повноцінний Linux у контейнері",
                  en: "Full Linux in a container",
                }[language],
              )}
            </View>
          );
        })()}

        {(linuxBusy || bootBusy || (debianProgress && debianProgress.percent > 0)) ? (
          <ProgressBar
            progress={bootBusy ? bootPercent : debianProgress?.percent ?? 0}
            label={bootBusy ? "bootstrap" : debianProgress?.stage || "linux"}
            sublabel={bootBusy ? bootMsg : debianProgress?.detail || linuxOutput?.slice(0, 100) || ""}
          />
        ) : null}

        <Text style={[styles.helpText, { marginTop: 8, marginBottom: 6 }]}>
          {{
            ru: linuxStatus?.available
              ? "Linux установлен. Можно пользоваться."
              : "Нажмите кнопку — программа сама поставит всё по очереди. Это займёт время и интернет.",
            uk: linuxStatus?.available
              ? "Linux встановлено."
              : "Натисніть кнопку — програма поставить все сама. Потрібен інтернет.",
            en: linuxStatus?.available
              ? "Linux is installed."
              : "Press the button — the app installs everything in order. Needs network and time.",
          }[language]}
        </Text>

        <TouchableOpacity
          onPress={() => {
            if (linuxStatus?.available) {
              void onLinuxStatus();
            } else {
              void onBootstrapContinue(false);
            }
          }}
          disabled={linuxBusy || bootBusy}
          style={[styles.actionFull, { backgroundColor: colors.accent, opacity: linuxBusy || bootBusy ? 0.5 : 1 }]}
        >
          <Text style={styles.actionText}>
            {linuxBusy || bootBusy
              ? ({ ru: "Идёт установка…", uk: "Йде встановлення…", en: "Installing…" } as const)[language]
              : linuxStatus?.available
                ? ({ ru: "Проверить Linux", uk: "Перевірити Linux", en: "Check Linux" } as const)[language]
                : ({ ru: "Установить Linux", uk: "Встановити Linux", en: "Install Linux" } as const)[language]}
          </Text>
        </TouchableOpacity>

        {!linuxStatus?.available ? (
          <TouchableOpacity
            onPress={() => void onLinuxStatus()}
            disabled={linuxBusy || bootBusy}
            style={[
              styles.actionFull,
              {
                backgroundColor: colors.surfaceRaised ?? colors.surface,
                borderWidth: 1,
                borderColor: colors.line,
                marginTop: 8,
              },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Только проверить статус", uk: "Лише перевірити статус", en: "Check status only" }[language]}
            </Text>
          </TouchableOpacity>
        ) : null}

        {linuxOutput ? (
          <Text selectable style={{ color: colors.muted, fontSize: 11, marginTop: 8 }} numberOfLines={6}>
            {linuxOutput}
          </Text>
        ) : null}
      </View>

      <TouchableOpacity
        onPress={() => setShowAdvanced((v) => !v)}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 14,
          },
        ]}
      >
        <Text style={{ color: colors.inkBright, fontWeight: "600", fontSize: 15 }}>
          {{ ru: "Дополнительно", uk: "Додатково", en: "Advanced" }[language]}
        </Text>
        <Ionicons name={showAdvanced ? "chevron-up" : "chevron-down"} size={20} color={colors.muted} />
      </TouchableOpacity>

      {showAdvanced ? (
      <>

      {fgTasks.length > 0 ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="pulse" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>
              {{ ru: "Фоновые задачи", uk: "Фонові задачі", en: "Background tasks" }[language]}
            </Text>
          </View>
          <Text style={styles.helpText}>
            {{
              ru: "Долгие операции (bootstrap, сборка, backup). Держите приложение открытым или с разрешением работы в фоне.",
              uk: "Тривалі операції. Тримайте застосунок відкритим або з дозволом фону.",
              en: "Long operations (bootstrap, build, backup). Keep the app open or allow background work.",
            }[language]}
          </Text>
          {fgTasks.map((task) => (
            <View key={task.id} style={{ marginBottom: 8 }}>
              <Text style={{ color: colors.inkBright, fontSize: 13, fontWeight: "600" }}>
                [{task.kind}] {task.title}
              </Text>
              <ProgressBar
                progress={Math.round((task.progress ?? 0) * 100)}
                sublabel={new Date(task.startedAt).toLocaleTimeString()}
              />
            </View>
          ))}
        </View>
      ) : null}

      {status ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="pulse-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("supervisor")}</Text>
          </View>
          <Text style={styles.helpText}>{rt("supervisorHelp")}</Text>
          <Row label={rt("runtimeLabel")} value={status.runtimeIdentity.runtimeVersion} colors={colors} />
          <Row label={rt("rootfs")} value={status.runtimeIdentity.rootfsVersion} colors={colors} />
          <Row label={rt("schema")} value={String(status.runtimeIdentity.schemaVersion)} colors={colors} />
          <Row label={rt("watchdog")} value={`${status.supervisor.status} · ${status.supervisor.watched} ${rt("watched")}`} colors={colors} />
          <Text style={styles.helpText}>{rt("watchdogHelp")}</Text>
          {(status.processList || []).filter((p) => p.watchdog).slice(0, 8).map((p) => (
            <Text key={p.id} style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
              · [{p.kind}] {p.label || p.id}
            </Text>
          ))}
          <View style={styles.rowBtns}>
            <TouchableOpacity onPress={() => { getRuntimeFacade().startSupervisor(); void refresh(); }} style={[styles.action, { backgroundColor: colors.accent }]}>
              <Text style={styles.actionText}>{rt("startWatchdog")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { getRuntimeFacade().stopSupervisor(); void refresh(); }} style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{rt("stopWatchdog")}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { getRuntimeFacade().clearSupervisorQuarantine(); void refresh(); }} style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>
                {{ ru: "Сброс карантина", uk: "Скинути карантин", en: "Clear quarantine" }[language]}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}


      

      {/* ===== Linux / Debian: clear step-by-step setup ===== */}
      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="server-outline" size={22} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>
            {{ ru: "Linux (Debian) — по шагам", uk: "Linux (Debian) — кроки", en: "Linux (Debian) — steps" }[language]}
          </Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "Нужен для полноценного Linux на телефоне (контейнер Debian). Обычная сборка APK через Termux часто работает и без Debian. Идите сверху вниз: у каждого шага — кнопка и что делать, если не вышло.",
            uk: "Потрібен для Linux (Debian) на телефоні. Збірка APK через Termux часто працює без Debian. Ідіть зверху вниз.",
            en: "Needed for full Linux (Debian) on the phone. Plain APK builds via Termux often work without Debian. Go top to bottom.",
          }[language]}
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            Termux: {linuxStatus == null ? "…" : linuxStatus.available ? "OK" : "—"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            · proot-distro:{" "}
            {linuxStatus == null ? "…" : linuxStatus.prootDistroInstalled ? "OK" : "нет"}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            · Debian: {linuxStatus == null ? "…" : linuxStatus.available ? "есть" : "нет"}
          </Text>
        </View>

        {(linuxBusy || (debianProgress && debianProgress.percent > 0) || bootBusy) ? (
          <ProgressBar
            progress={bootBusy ? bootPercent : debianProgress?.percent ?? 0}
            label={bootBusy ? "bootstrap" : debianProgress?.stage || "linux"}
            sublabel={
              bootBusy ? bootMsg : debianProgress?.detail || linuxOutput?.slice(0, 80) || ""
            }
          />
        ) : null}

        <Text style={[styles.helpText, { marginTop: 8, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "0. Связь с Termux", uk: "0. Зв'язок з Termux", en: "0. Talk to Termux" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Если в логе RUN_COMMAND / allow-external-apps — нажмите кнопку. Иначе AI Builder не сможет запускать команды.",
            uk: "Якщо в лозі RUN_COMMAND / allow-external-apps — натисніть кнопку.",
            en: "If the log shows RUN_COMMAND / allow-external-apps — press the button.",
          }[language]}
        </Text>
        <TouchableOpacity
          onPress={() => void onFixAllowExternalApps()}
          disabled={linuxBusy || bootBusy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}
        >
          <Text style={[styles.actionText, { color: colors.inkBright }]}>
            {{ ru: "Включить allow-external-apps", uk: "Увімкнути allow-external-apps", en: "Enable allow-external-apps" }[language]}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 12, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "1. Зеркала пакетов (pkg)", uk: "1. Дзеркала пакетів", en: "1. Package mirrors" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Если пакеты не ставятся и видно «Testing the available mirrors» — зеркала не отвечают. Кнопка переключит на зеркало Cloudflare Termux и выполнит pkg update.",
            uk: "Якщо «Testing the available mirrors» — дзеркала мертві. Кнопка перемкне на Cloudflare і зробить pkg update.",
            en: "If install hangs on «Testing the available mirrors», mirrors are dead. Switches to Termux Cloudflare and runs pkg update.",
          }[language]}
        </Text>
        <TouchableOpacity
          onPress={() => void onFixTermuxMirrors()}
          disabled={linuxBusy || bootBusy}
          style={[styles.actionFull, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.actionText}>
            {linuxBusy
              ? "…"
              : (
                  {
                    ru: "Исправить зеркала и обновить pkg",
                    uk: "Виправити дзеркала і оновити pkg",
                    en: "Fix mirrors & pkg update",
                  } as const
                )[language]}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 12, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "2. Установить proot-distro", uk: "2. Встановити proot-distro", en: "2. Install proot-distro" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Инструмент Termux, без которого образ Debian не поставить. Сначала шаг 1, потом эта кнопка.",
            uk: "Без цього не встановити Debian. Спочатку крок 1.",
            en: "Required before Debian. Run after step 1.",
          }[language]}
        </Text>
        <TouchableOpacity
          onPress={() => void onInstallProotDistro()}
          disabled={linuxBusy || bootBusy}
          style={[styles.actionFull, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.actionText}>
            {linuxBusy
              ? "…"
              : (
                  {
                    ru: "Установить proot-distro",
                    uk: "Встановити proot-distro",
                    en: "Install proot-distro",
                  } as const
                )[language]}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 12, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "3. Установить Debian (долго)", uk: "3. Встановити Debian (довго)", en: "3. Install Debian (long)" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Скачивает rootfs Debian. Нужен интернет, 5–20+ минут. Включите «Выживание в фоне» в Настройках, не убивайте приложение.",
            uk: "Завантажує rootfs Debian. 5–20+ хв. Увімкніть виживання у фоні.",
            en: "Downloads Debian rootfs. Needs network, 5–20+ minutes. Enable background survival in Settings.",
          }[language]}
        </Text>
        <TouchableOpacity
          onPress={() => void onLinuxBootstrap()}
          disabled={linuxBusy || bootBusy}
          style={[styles.actionFull, { backgroundColor: colors.accent }]}
        >
          <Text style={styles.actionText}>
            {linuxBusy
              ? "…"
              : (
                  {
                    ru: "Установить / доустановить Debian",
                    uk: "Встановити Debian",
                    en: "Install / repair Debian",
                  } as const
                )[language]}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 12, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "4. Авто-мастер (все стадии подряд)", uk: "4. Авто-майстер", en: "4. Auto wizard (all stages)" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Termux → инструменты → proot-distro → Debian → workspace → проверка. Упало на зеркалах — шаг 1, потом снова «Продолжить».",
            uk: "Termux → інструменти → proot → Debian → workspace. Дзеркала — крок 1, потім «Продовжити».",
            en: "Termux → tools → proot-distro → Debian → workspace → verify. Mirror fail → step 1, then Continue.",
          }[language]}
        </Text>
        {(bootState?.stages || []).map((s: any) => (
          <View key={s.id} style={styles.diagRow}>
            <Text
              style={{
                color:
                  s.status === "ok" || s.status === "skipped"
                    ? colors.accent
                    : s.status === "error"
                      ? colors.danger || "#f66"
                      : s.status === "running"
                        ? "#e6a700"
                        : colors.muted,
                fontWeight: "700",
                fontSize: 11,
                width: 72,
              }}
            >
              {String(s.status).toUpperCase()}
            </Text>
            <Text style={{ color: colors.inkBright, flex: 1, fontSize: 12 }}>
              {s.id}
              {s.message ? ` — ${s.message}` : ""}
            </Text>
          </View>
        ))}
        {bootMsg ? <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>{bootMsg}</Text> : null}
        <View style={styles.rowBtns}>
          <TouchableOpacity
            onPress={() => void onBootstrapContinue(false)}
            disabled={bootBusy || linuxBusy}
            style={[styles.action, { backgroundColor: colors.accent, opacity: bootBusy ? 0.5 : 1 }]}
          >
            <Text style={styles.actionText}>
              {bootBusy ? "…" : ({ ru: "Продолжить", uk: "Продовжити", en: "Continue" } as const)[language]}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onBootstrapContinue(true)}
            disabled={bootBusy || linuxBusy}
            style={[
              styles.action,
              { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Сначала", uk: "Спочатку", en: "Force all" }[language]}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          onPress={() => void onBootstrapReset()}
          disabled={bootBusy}
          style={[styles.miniBtn, { borderColor: colors.line, marginTop: 8, alignSelf: "flex-start" }]}
        >
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {{ ru: "Сбросить стадии мастера", uk: "Скинути стадії", en: "Reset wizard stages" }[language]}
          </Text>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 12, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "5. Проверка", uk: "5. Перевірка", en: "5. Verify" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Статус среды и uname внутри Debian — убедиться, что Linux жив.",
            uk: "Статус і uname всередині Debian.",
            en: "Status and uname inside Debian to confirm Linux is alive.",
          }[language]}
        </Text>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            onPress={() => void onLinuxStatus()}
            disabled={linuxBusy}
            style={[styles.action, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.actionText}>
              {linuxBusy ? "…" : ({ ru: "Статус", uk: "Статус", en: "Status" } as const)[language]}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => void onLinuxCheck()}
            disabled={linuxBusy}
            style={[
              styles.action,
              { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line },
            ]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>uname -a</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.helpText, { marginTop: 14, marginBottom: 2, fontWeight: "700", color: colors.inkBright }]}>
          {{ ru: "Дополнительно: перенос образа", uk: "Додатково: перенесення", en: "Extra: move image" }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 6 }}>
          {{
            ru: "Экспорт в .tar.gz на память телефона или импорт готового архива — без повторной загрузки из сети.",
            uk: "Експорт у .tar.gz або імпорт готового архіву.",
            en: "Export to .tar.gz or import an archive — no re-download.",
          }[language]}
        </Text>
        <TextInput
          value={debianExportPath}
          onChangeText={setDebianExportPath}
          placeholder={
            status?.home
              ? `${status.home}/exports/debian.tar.gz`
              : "/storage/emulated/0/AIBuilderTermux/exports/debian.tar.gz"
          }
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]}
          autoCapitalize="none"
        />
        <TouchableOpacity
          onPress={() => void onDebianExport()}
          disabled={linuxBusy}
          style={[
            styles.action,
            { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line },
          ]}
        >
          <Text style={[styles.actionText, { color: colors.inkBright }]}>
            {{ ru: "Экспорт Debian", uk: "Експорт Debian", en: "Export Debian" }[language]}
          </Text>
        </TouchableOpacity>
        <TextInput
          value={debianImportPath}
          onChangeText={setDebianImportPath}
          placeholder={{ ru: "Путь к .tar.gz для импорта", uk: "Шлях до .tar.gz", en: "Path to .tar.gz to import" }[language]}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line, marginTop: 8 }]}
          autoCapitalize="none"
        />
        <TouchableOpacity
          onPress={() => void onDebianImport()}
          disabled={linuxBusy || !debianImportPath.trim()}
          style={[styles.action, { backgroundColor: colors.accent, opacity: !debianImportPath.trim() ? 0.45 : 1 }]}
        >
          <Text style={styles.actionText}>
            {{ ru: "Импорт Debian", uk: "Імпорт Debian", en: "Import Debian" }[language]}
          </Text>
        </TouchableOpacity>

        {linuxOutput ? (
          <Text selectable style={{ color: colors.muted, fontSize: 11, marginTop: 10 }}>
            {linuxOutput}
          </Text>
        ) : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="cube-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("containerManager")}</Text>
        </View>
        <Text style={styles.helpText}>{rt("containerHelp")}</Text>
        <Row label={rt("container")} value={containerId ?? rt("none")} colors={colors} />
        <Text style={{ color: colors.muted, fontSize: 11 }}>{rt("debianUserspace")}</Text>
        <TouchableOpacity onPress={() => void onContainerCreate()} disabled={containerBusy} style={[styles.actionFull, { backgroundColor: colors.accent }]}>
          <View style={styles.actionInner}>
            <Ionicons name="play-circle-outline" size={20} color="#fff" />
            <View style={styles.actionTextCol}>
              <Text style={styles.actionText}>{containerBusy ? rt("working") : rt("createStartDebian")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "Поднять proot-Debian и привязать к проекту", uk: "Підняти proot-Debian і прив'язати до проєкту", en: "Start proot-Debian and bind to the project" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <Text style={[styles.helpText, { marginTop: 4, marginBottom: 2 }]}>
          {{ ru: "Цепочка внутри контейнера (нужен запущенный Debian):", uk: "Ланцюжок у контейнері (потрібен запущений Debian):", en: "In-container pipeline (Debian must be running):" }[language]}
        </Text>

        <TouchableOpacity onPress={() => void onWorkspaceBuild()} disabled={!containerId || workspaceBuildBusy} style={[styles.actionFull, { backgroundColor: colors.accent, opacity: !containerId ? 0.45 : 1 }]}>
          <View style={styles.actionInner}>
            <Ionicons name="construct-outline" size={20} color="#fff" />
            <View style={styles.actionTextCol}>
              <Text style={styles.actionText}>{workspaceBuildBusy ? rt("buildingWorkspace") : rt("installCheckWorkspace")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "Пакеты, toolchain и проверка /workspace", uk: "Пакети, toolchain і перевірка /workspace", en: "Packages, toolchain and /workspace check" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {!!workspaceBuildOutput && <Text selectable style={{ color: colors.muted, fontSize: 11 }}>{workspaceBuildOutput.slice(-2500)}</Text>}

        <TouchableOpacity onPress={() => void onProjectGenerate()} disabled={!containerId || projectGenerateBusy} style={[styles.actionFull, { backgroundColor: colors.accent, opacity: !containerId ? 0.45 : 1 }]}>
          <View style={styles.actionInner}>
            <Ionicons name="code-slash-outline" size={20} color="#fff" />
            <View style={styles.actionTextCol}>
              <Text style={styles.actionText}>{projectGenerateBusy ? rt("generatingProject") : rt("generateBuildTest")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "Сгенерировать код, собрать и прогнать тест", uk: "Згенерувати код, зібрати й прогнати тест", en: "Generate code, build and run a test" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {!!projectGenerateOutput && <Text selectable style={{ color: colors.muted, fontSize: 10 }}>{projectGenerateOutput.slice(-3500)}</Text>}

        <TouchableOpacity onPress={() => void onCodingAgent()} disabled={!containerId || codingAgentBusy} style={[styles.actionFull, { backgroundColor: colors.accent, opacity: !containerId ? 0.45 : 1 }]}>
          <View style={styles.actionInner}>
            <Ionicons name="sparkles-outline" size={20} color="#fff" />
            <View style={styles.actionTextCol}>
              <Text style={styles.actionText}>{codingAgentBusy ? rt("codingAgent") : rt("codeBuildTestRepair")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "ИИ-агент: правка → сборка → тест → автопочинка", uk: "ШІ-агент: правки → збірка → тест → автопочинка", en: "AI agent: edit → build → test → self-repair" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        {!!codingAgentOutput && <Text selectable style={{ color: colors.muted, fontSize: 10 }}>{codingAgentOutput.slice(-4000)}</Text>}

        <View style={styles.rowBtns}>
          <TouchableOpacity onPress={() => void onContainerStop()} disabled={!containerId || containerBusy} style={[styles.miniBtn, { borderColor: colors.line, flex: 1, opacity: !containerId ? 0.45 : 1, alignItems: "center" }]}>
            <Ionicons name="stop-outline" size={16} color={colors.inkBright} />
            <Text style={{ color: colors.inkBright, fontSize: 12, marginTop: 2 }}>{rt("stop")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onContainerRemove()} disabled={!containerId || containerBusy} style={[styles.miniBtn, { borderColor: colors.line, flex: 1, opacity: !containerId ? 0.45 : 1, alignItems: "center" }]}>
            <Ionicons name="trash-outline" size={16} color={colors.inkBright} />
            <Text style={{ color: colors.inkBright, fontSize: 12, marginTop: 2 }}>{rt("remove")}</Text>
          </TouchableOpacity>
        </View>
        {containerOutput ? <Text selectable style={{ color: colors.muted, fontSize: 10 }}>{containerOutput}</Text> : null}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="phone-portrait-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("deviceBridge")}</Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "ADB к этому или другому устройству: установка APK, logcat, автотесты. Нужны android-tools в Termux.",
            uk: "ADB до пристрою: APK, logcat, автотести. Потрібні android-tools у Termux.",
            en: "ADB to this or another device: APK install, logcat, tests. Needs android-tools in Termux.",
          }[language]}
        </Text>
        <Row label={rt("status")} value={deviceAvailable == null ? rt("notChecked") : deviceAvailable ? rt("connected") : rt("unavailable")} colors={colors} />
        <Text style={styles.helpText}>{adbWizardHelp(language)}</Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>
          {{ ru: "1. Сопряжение (pair)", uk: "1. Спарювання", en: "1. Pair" }[language]}
        </Text>
        <TextInput
          value={adbPairHost}
          onChangeText={setAdbPairHost}
          placeholder="192.168.1.10:37000"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <TextInput
          value={adbPairCode}
          onChangeText={setAdbPairCode}
          placeholder={{ ru: "6-значный код", uk: "6-значний код", en: "6-digit code" }[language]}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]}
          keyboardType="number-pad"
          maxLength={6}
        />
        <TouchableOpacity
          onPress={() => void onAdbPair()}
          disabled={deviceBusy || !adbPairHost.trim() || adbPairCode.length < 6}
          style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line, opacity: adbPairCode.length < 6 ? 0.45 : 1 }]}
        >
          <Text style={[styles.actionText, { color: colors.inkBright }]}>
            {{ ru: "Pair (сопряжение)", uk: "Pair", en: "Pair" }[language]}
          </Text>
        </TouchableOpacity>
        <Text style={{ color: colors.muted, fontSize: 12, marginTop: 10, marginBottom: 4 }}>
          {{ ru: "2. Подключение (connect)", uk: "2. Підключення", en: "2. Connect" }[language]}
        </Text>
        <TextInput
          value={adbConnectHost}
          onChangeText={setAdbConnectHost}
          placeholder="192.168.1.10:5555"
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]}
          autoCapitalize="none"
          keyboardType="numbers-and-punctuation"
        />
        <View style={styles.rowBtns}>
          <TouchableOpacity
            onPress={() => void onAdbConnect()}
            disabled={deviceBusy || !adbConnectHost.trim()}
            style={[styles.action, { backgroundColor: colors.accent, opacity: !adbConnectHost.trim() ? 0.45 : 1 }]}
          >
            <Text style={styles.actionText}>
              {{ ru: "Connect", uk: "Connect", en: "Connect" }[language]}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onConnectDevice()} disabled={deviceBusy} style={[styles.action, { backgroundColor: colors.accent }]}>
            <Text style={styles.actionText}>{deviceBusy ? "…" : rt("connectAdb")}</Text>
          </TouchableOpacity>
        </View>
        {adbDevicesText ? (
          <Text selectable style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>{adbDevicesText}</Text>
        ) : null}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <TouchableOpacity onPress={() => void onDeviceLogcat()} disabled={!deviceAvailable} style={[styles.miniBtn, { borderColor: colors.line, flex: 1 }]}>
            <Text style={{ color: colors.inkBright, fontSize: 12 }}>{rt("logcat")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onStopDevice()} style={[styles.miniBtn, { borderColor: colors.line, flex: 1 }]}>
            <Text style={{ color: colors.inkBright, fontSize: 12 }}>{rt("stopSession")}</Text>
          </TouchableOpacity>
        </View>
        <TextInput value={deviceApkPath} onChangeText={setDeviceApkPath} placeholder={rt("apkPath")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="none" />
        <TextInput value={devicePackageName} onChangeText={setDevicePackageName} placeholder={rt("packagePath")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="none" />
        <TouchableOpacity onPress={() => void onRunDeviceLoop()} disabled={!deviceAvailable || deviceBusy} style={[styles.action, { backgroundColor: colors.accent }]}>
          <Text style={styles.actionText}>{deviceBusy ? rt("runningDevice") : rt("installLaunchScreenshotLogcat")}</Text>
        </TouchableOpacity>
        <TextInput
          value={deviceGoal}
          onChangeText={setDeviceGoal}
          placeholder={rt("deviceTestGoal")}
          placeholderTextColor={colors.muted}
          style={[styles.input, styles.multilineInput, { color: colors.inkBright, borderColor: colors.line }]}
          multiline
        />
        <TouchableOpacity onPress={() => void onRunDeviceSuite()} disabled={!deviceAvailable || deviceSuiteBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceSuiteBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceSuiteBusy ? rt("runSuite") : rt("generateRunSuite")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onRunSelfHealingQA()} disabled={!deviceAvailable || deviceSelfHealBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceSelfHealBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceSelfHealBusy ? rt("selfHealingRunning") : rt("selfHealingQa")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onRunReleaseGate()} disabled={!deviceAvailable || deviceReleaseGateBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceReleaseGateBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceReleaseGateBusy ? rt("releaseGateRunning") : rt("releaseGate")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onRunReleaseArtifact()} disabled={!deviceAvailable || deviceReleaseArtifactBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceReleaseArtifactBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceReleaseArtifactBusy ? rt("releaseBundleRunning") : rt("releaseBundle")}</Text>
        </TouchableOpacity>
        <TextInput value={deviceReleaseChannel} onChangeText={setDeviceReleaseChannel} placeholder={rt("releaseChannel")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="none" />
        <TouchableOpacity onPress={() => void onPublishReleaseChannel()} disabled={!deviceAvailable || deviceReleaseChannelBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceReleaseChannelBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceReleaseChannelBusy ? rt("publishingChannel") : rt("publishChannel")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onRollbackReleaseChannel()} disabled={!deviceAvailable || deviceRollbackBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceRollbackBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceRollbackBusy ? rt("rollingBack") : rt("rollbackRelease")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onProductionDeploy()} disabled={!deviceAvailable || deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceDeployBusy ? rt("productionDeploying") : rt("productionDeploy")}</Text>
        </TouchableOpacity>
        <Text style={[styles.helpText, { marginTop: 10 }]}>
          {{
            ru: "Флот / релиз (продвинутое). Нужны ADB и несколько устройств или CI. Обычной сборке APK эти кнопки не обязательны: используйте проект выше и «Пакети»/Termux.",
            uk: "Флот / реліз (просунуте). Потрібні ADB і кілька пристроїв. Для звичайної збірки APK не обовʼязково.",
            en: "Fleet / release (advanced). Needs ADB and multiple devices or CI. Not required for a normal single-device APK build.",
          }[language]}
        </Text>
        <TouchableOpacity onPress={() => void onFleetDeploy()} disabled={!deviceAvailable || deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceDeployBusy ? rt("fleetDeploying") : rt("fleetRollout")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetCanary()} disabled={!deviceAvailable || deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceDeployBusy ? rt("fleetCanaryRunning") : rt("fleetCanary")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetObservability()} disabled={deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceDeployBusy ? rt("fleetObservabilityRunning") : rt("fleetObservability")}</Text>
        </TouchableOpacity>
        <TextInput value={fleetRole} onChangeText={setFleetRole} placeholder={rt("fleetRole")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="none" />
        <TextInput value={fleetConfirmation} onChangeText={setFleetConfirmation} placeholder={rt("productionPhrase")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="characters" />
        <TouchableOpacity onPress={() => void onFleetPolicy()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("fleetPolicy")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onSaveFleetPolicy()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("saveFleetPolicy")}</Text>
        </TouchableOpacity>
        <TextInput value={fleetBackupSecret} onChangeText={setFleetBackupSecret} placeholder={rt("backupSecret")} placeholderTextColor={colors.muted} secureTextEntry style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} />
        <TouchableOpacity onPress={() => void onFleetBackupCreate()} disabled={fleetCommandBusy || !project || fleetBackupSecret.length < 12} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy || fleetBackupSecret.length < 12 ? 0.5 : 1 }]}>
          <Text style={styles.actionText}>{rt("fleetBackup")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetBackupVerify()} disabled={fleetCommandBusy || !project || !fleetBackups[0]} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy || !fleetBackups[0] ? 0.5 : 1 }]}>
          <Text style={styles.actionText}>{rt("verifyBackup")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetRecoverySchedule()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("recoverySlo")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetRecoveryScheduledRun()} disabled={fleetCommandBusy || !project || fleetBackupSecret.length < 12} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy || fleetBackupSecret.length < 12 ? 0.5 : 1 }]}>
          <Text style={styles.actionText}>{rt("scheduledRecovery")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetUnifiedControlCenter()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{fleetCommandBusy ? rt("unifiedControlRunning") : rt("unifiedFleet")}</Text>
        </TouchableOpacity>
        {fleetUnifiedControl ? (
          <View style={{ paddingVertical: 5 }}>
            <Text selectable style={{ color: fleetUnifiedControl.status === "incident" ? colors.danger : colors.muted, fontSize: 10 }}>Control Center: {fleetUnifiedControl.status.toUpperCase()} · {fleetUnifiedControl.channel}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Devices: {fleetUnifiedControl.summary.healthyDevices}/{fleetUnifiedControl.summary.devices} healthy · failed {fleetUnifiedControl.summary.failedDevices} · offline {fleetUnifiedControl.summary.offlineDevices}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Incidents: {fleetUnifiedControl.summary.openIncidents} · alerts {fleetUnifiedControl.summary.activeAlerts} · critical {fleetUnifiedControl.summary.criticalAlerts} · outbox {fleetUnifiedControl.summary.pendingNotifications}</Text>
          </View>
        ) : null}
        <TouchableOpacity onPress={() => void onFleetSloDashboard()} disabled={deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("fleetSlo")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetAlertEscalation()} disabled={deviceDeployBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceDeployBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceDeployBusy ? rt("fleetEscalationRunning") : rt("fleetEscalation")}</Text>
        </TouchableOpacity>
        {fleetEscalation ? (
          <View style={{ marginTop: 6, gap: 3 }}>
            <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Escalation: active {fleetEscalation.escalatedCount} · acknowledged {fleetEscalation.acknowledgedCount} · resolved {fleetEscalation.resolvedCount} · outbox {fleetEscalation.pendingNotifications}</Text>
            {fleetEscalation.alerts.filter((x: any) => x.state !== "resolved").slice(0, 5).map((item: any) => (
              <View key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text selectable style={{ flex: 1, color: item.level === "critical" ? colors.danger : colors.muted, fontSize: 9 }}>{item.level.toUpperCase()} · {item.type} · {item.message}</Text>
                <TouchableOpacity onPress={() => void acknowledgeAIFleetEscalatedAlert({ channel: deviceReleaseChannel as any, alertId: item.id }).then(() => onFleetAlertEscalation())}>
                  <Text style={{ color: colors.accent, fontSize: 9 }}>{rt("ack")}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => void resolveAIFleetEscalatedAlert({ channel: deviceReleaseChannel as any, alertId: item.id }).then(() => onFleetAlertEscalation())}>
                  <Text style={{ color: colors.accent, fontSize: 9 }}>{rt("resolve")}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        ) : null}
        {fleetSloDashboard ? (
          <View style={{ marginTop: 6, gap: 4 }}>
            <Text selectable style={{ color: fleetSloDashboard.overallStatus === "incident" ? colors.danger : colors.muted, fontSize: 10 }}>SLO Dashboard: {fleetSloDashboard.overallStatus.toUpperCase()} · failure {fleetSloDashboard.metrics.failureRate.toFixed(1)}% · incidents {fleetSloDashboard.metrics.incidentCount} · open {fleetSloDashboard.metrics.openIncidentCount}</Text>
            <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Backup: {fleetSloDashboard.metrics.backupFresh ? "FRESH" : "STALE"} · Drill: {fleetSloDashboard.metrics.drillFresh ? "FRESH" : "STALE"} · consecutive failures: {fleetSloDashboard.metrics.consecutiveRecoveryFailures}</Text>
            {fleetSloDashboard.timeline.slice(0, 4).map((item: any, index: number) => (
              <TouchableOpacity key={`${item.at}-${index}`} onPress={() => void onFleetSloAcknowledge(item)} style={{ paddingVertical: 2 }}>
                <Text selectable style={{ color: item.severity === "critical" ? colors.danger : colors.muted, fontSize: 9 }}>{item.severity.toUpperCase()} · {item.type} · {item.message}{item.incidentId ? " · tap to acknowledge" : ""}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
        {fleetRecoverySchedule ? <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Recovery: {fleetRecoverySchedule.enabled ? "ON" : "OFF"} · every {fleetRecoverySchedule.intervalMinutes}m · next {fleetRecoverySchedule.nextRunAt || "due now"}</Text> : null}
        {fleetRecoverySlo ? <Text selectable style={{ color: fleetRecoverySlo.status === "FAIL" ? colors.danger : colors.muted, fontSize: 10 }}>Recovery SLO: {fleetRecoverySlo.status} · alerts {fleetRecoverySlo.alerts?.length || 0}</Text> : null}
        <TouchableOpacity onPress={() => void onFleetBackupRestore()} disabled={fleetCommandBusy || !project || !fleetBackups[0]} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy || !fleetBackups[0] ? 0.5 : 1 }]}>
          <Text style={styles.actionText}>{rt("restoreBackup")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetRecoveryDrill()} disabled={fleetCommandBusy || !project || !fleetBackups[0] || fleetBackupSecret.length < 12} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy || !fleetBackups[0] || fleetBackupSecret.length < 12 ? 0.5 : 1 }]}>
          <Text style={styles.actionText}>{rt("disasterRecovery")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetAudit()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("audit")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetAuditSecurity()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("secureAudit")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetAuditExport()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("exportAudit")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetSnapshot()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("createSnapshot")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onFleetRecovery()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{rt("restoreSnapshot")}</Text>
        </TouchableOpacity>
        {fleetPolicy ? <Text selectable style={{ color: colors.muted, fontSize: 10 }}>Fleet Policy: {fleetPolicy.role} · Production confirmation: {fleetPolicy.requireProductionConfirmation ? "ON" : "OFF"}</Text> : null}
        <TouchableOpacity onPress={() => void onFleetCommandCenter()} disabled={fleetCommandBusy || !project} style={[styles.action, { backgroundColor: colors.accent, opacity: fleetCommandBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{fleetCommandBusy ? rt("fleetCommandRunning") : rt("fleetCommand")}</Text>
        </TouchableOpacity>
        {fleetSnapshot ? (
          <View style={{ marginTop: 8, gap: 6 }}>
            <Text style={{ color: colors.inkBright, fontWeight: "700", fontSize: 12 }}>
              {String(fleetSnapshot.channel).toUpperCase()} · {String(fleetSnapshot.observability.status).toUpperCase()} · failure {Number(fleetSnapshot.observability.failureRate || 0).toFixed(1)}%
            </Text>
            {fleetSnapshot.devices.map((d: any) => (
              <View key={d.serial} style={{ borderWidth: 1, borderColor: colors.line, padding: 7, borderRadius: 8 }}>
                <Text selectable style={{ color: colors.inkBright, fontSize: 11 }}>{d.serial} · {d.status} · {d.currentVersionName || "no release"}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 5 }}>
                  <TouchableOpacity onPress={() => void onFleetDeviceCommand(d.serial, "deploy")} disabled={fleetCommandBusy || d.state !== "device"} style={[styles.action, { flex: 1, marginTop: 0, paddingVertical: 6, opacity: fleetCommandBusy || d.state !== "device" ? 0.5 : 1 }]}>
                    <Text style={styles.actionText}>{rt("deploy")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => void onFleetDeviceCommand(d.serial, "rollback")} disabled={fleetCommandBusy || !d.previousReleaseId || d.state !== "device"} style={[styles.action, { flex: 1, marginTop: 0, paddingVertical: 6, opacity: fleetCommandBusy || !d.previousReleaseId || d.state !== "device" ? 0.5 : 1 }]}>
                    <Text style={styles.actionText}>{rt("rollback")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {fleetSnapshot.observability.incidents.slice(-3).map((incident: any) => (
              <Text key={incident.id} selectable style={{ color: colors.muted, fontSize: 10 }}>Incident {incident.id}: {incident.reason} · {incident.devices?.length || 0} devices</Text>
            ))}
          </View>
        ) : null}
        <TouchableOpacity onPress={() => void onRunAutonomousDeviceLoop()} disabled={!deviceAvailable || deviceLoopBusy} style={[styles.action, { backgroundColor: colors.accent, opacity: deviceLoopBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{deviceLoopBusy ? rt("buildVisionFixRunning") : rt("buildVisionFix")}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => void onRunRealDeviceIntegration()} disabled={realDeviceBusy} style={[styles.action, { backgroundColor: colors.accent, opacity: realDeviceBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{realDeviceBusy ? rt("realAndroidRunning") : rt("realAndroid")}</Text>
        </TouchableOpacity>
        {realDeviceOutput ? <Text selectable style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>{realDeviceOutput}</Text> : null}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          <TouchableOpacity onPress={() => void onPersistentWorkspace("status")} disabled={persistentWorkspaceBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: persistentWorkspaceBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{persistentWorkspaceBusy ? rt("workspaceRunning") : rt("workspaceStatus")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onPersistentWorkspace("checkpoint")} disabled={persistentWorkspaceBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: persistentWorkspaceBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{rt("checkpoint")}</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          <TouchableOpacity onPress={() => void onPersistentWorkspace("snapshot")} disabled={persistentWorkspaceBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: persistentWorkspaceBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{rt("snapshot")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onPersistentWorkspace("undo")} disabled={persistentWorkspaceBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: persistentWorkspaceBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{rt("undoLast")}</Text>
          </TouchableOpacity>
        </View>
        {persistentWorkspaceOutput ? <Text selectable style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>{persistentWorkspaceOutput}</Text> : null}
        <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
          <TouchableOpacity onPress={() => void onProjectMemory("status")} disabled={projectMemoryBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: projectMemoryBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{projectMemoryBusy ? rt("memoryRunning") : rt("aiMemory")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onProjectMemory("build")} disabled={projectMemoryBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: projectMemoryBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{rt("recordBuild")}</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => void onProjectMemory("test")} disabled={projectMemoryBusy} style={[styles.action, { flex: 1, marginTop: 0, opacity: projectMemoryBusy ? 0.6 : 1 }]}>
            <Text style={styles.actionText}>{rt("recordTest")}</Text>
          </TouchableOpacity>
        </View>
        {projectMemoryOutput ? <Text selectable style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>{projectMemoryOutput}</Text> : null}

        <Text style={[styles.cardTitle, { color: colors.inkBright, marginTop: 12 }]}>{rt("factory")}</Text>
        <TextInput value={factoryName} onChangeText={setFactoryName} placeholder={rt("appProjectName")} placeholderTextColor={colors.muted} style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]} autoCapitalize="none" />
        <TextInput value={factoryPrompt} onChangeText={setFactoryPrompt} placeholder={rt("describeApp")} placeholderTextColor={colors.muted} style={[styles.input, styles.multilineInput, { color: colors.inkBright, borderColor: colors.line }]} multiline />
        <TouchableOpacity onPress={() => void onOneClickFactory()} disabled={factoryBusy} style={[styles.action, { backgroundColor: colors.accent, opacity: factoryBusy ? 0.6 : 1 }]}>
          <Text style={styles.actionText}>{factoryBusy ? rt("factoryRunning") : rt("factoryRun")}</Text>
        </TouchableOpacity>
        {factoryOutput ? <Text selectable style={{ color: colors.muted, fontSize: 10, marginTop: 6 }}>{factoryOutput.slice(-7000)}</Text> : null}
        {deviceOutput ? <Text selectable style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>{deviceOutput}</Text> : null}
      </View>

      {project ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="folder-open-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("activeProject")}</Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "Привязка текущего проекта к Runtime (сессии, контейнер, backup paths).",
            uk: "Прив'язка поточного проєкту до Runtime.",
            en: "Bind the current project to Runtime (sessions, container, backup paths).",
          }[language]}
        </Text>
          <Row label={rt("id")} value={project.id} colors={colors} />
          <Row label={rt("name")} value={project.name} colors={colors} />
          <Row label={rt("path")} value={project.path} colors={colors} />
          <TouchableOpacity
            onPress={() => void onBindActive()}
            disabled={busy}
            style={[styles.action, { backgroundColor: colors.accent, marginTop: 6 }]}
          >
            <Text style={styles.actionText}>
              {busy ? "…" : rt("bindActive")}
            </Text>
          </TouchableOpacity>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.inkBright }]}>
          {t("runtimeStatus")}
        </Text>
        {status ? (
          <>
            <Row label="HOME" value={status.home} colors={colors} />
            <Row label={rt("sessions")} value={String(status.sessions)} colors={colors} />
            {(status.sessionList?.length ?? 0) > 0 ? (
              <View style={{ gap: 2, marginBottom: 4 }}>
                {status.sessionList.slice(0, 8).map((s) => (
                  <Text key={s.id} style={{ color: colors.inkBright, fontSize: 12 }}>
                    {s.id}
                    {s.projectId ? ` · ${s.projectId}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}
            <Row label={rt("processes")} value={String(status.processes)} colors={colors} />
            <Row label={rt("containers")} value={String(status.containers)} colors={colors} />
            <Row label={rt("images")} value={String(status.containerImages)} colors={colors} />
            <Row label={rt("agents")} value={String(status.agents)} colors={colors} />
            <Row label={rt("toolchains")} value={String(status.toolchains)} colors={colors} />
            <Row label={rt("privilege")} value={status.privilegeActive} colors={colors} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
              <TouchableOpacity
                onPress={() => void (async () => {
                  try {
                    const p = await getRuntimeFacade().refreshPrivileges();
                    setMessage(`privileges: active=${p.active} shizuku=${p.shizuku} root=${p.root} adb=${p.adb}`);
                    await refresh();
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  }
                })()}
                style={[styles.miniBtn, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.accent, fontSize: 12 }}>
                  {{ ru: "Обновить privileges", uk: "Оновити privileges", en: "Refresh privileges" }[language]}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => void (async () => {
                  try {
                    const r = await getRuntimeFacade().shizukuSelfCheck();
                    setMessage(r.message);
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  }
                })()}
                style={[styles.miniBtn, { borderColor: colors.line }]}
              >
                <Text style={{ color: colors.accent, fontSize: 12 }}>
                  {{ ru: "Тест Shizuku/rish", uk: "Тест Shizuku/rish", en: "Test Shizuku/rish" }[language]}
                </Text>
              </TouchableOpacity>
            </View>
            <Row
              label={rt("native")}
              value={status.nativeAvailable ? rt("yes") : rt("no")}
              colors={colors}
            />
            {(status.processList?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 6, gap: 4 }}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{rt("processes")}</Text>
                {status.processList.slice(0, 12).map((p) => (
                  <Text key={p.id} style={{ color: colors.inkBright, fontSize: 12 }}>
                    [{p.kind}] {p.label || p.id}
                    {p.projectId ? ` · ${p.projectId}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}
            {(status.toolchainList?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 6, gap: 4 }}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{rt("toolchains")}</Text>
                {status.toolchainList.slice(0, 12).map((m) => (
                  <Text key={m.id} style={{ color: colors.inkBright, fontSize: 12 }}>
                    [{m.health}] {m.kind}: {m.name}
                    {m.version ? ` · ${m.version}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}
            {(status.agentList?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 6, gap: 4 }}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{rt("agents")}</Text>
                {status.agentList.slice(0, 12).map((a) => (
                  <Text key={a.id} style={{ color: colors.inkBright, fontSize: 12 }}>
                    [{a.status}] {a.id}
                    {a.projectId ? ` · ${a.projectId}` : ""}
                  </Text>
                ))}
              </View>
            ) : null}
            {(status.containerList?.length ?? 0) > 0 ? (
              <View style={{ marginTop: 6, gap: 6 }}>
                <Text style={{ color: colors.muted, fontWeight: "700" }}>{rt("containers")}</Text>
                {status.containerList.slice(0, 12).map((c) => (
                  <View key={c.id} style={{ gap: 4 }}>
                    <Text style={{ color: colors.inkBright, fontSize: 12 }}>
                      [{c.status}] {c.name} · {c.imageId}
                      {c.projectId ? ` · ${c.projectId}` : ""}
                    </Text>
                    <View style={{ flexDirection: "row", gap: 8 }}>
                      <TouchableOpacity
                        onPress={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await stopContainer(c.id);
                              setMessage(`stopped:${c.id}`);
                            } catch (e) {
                              setMessage(e instanceof Error ? e.message : String(e));
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                        disabled={busy}
                        style={[styles.miniBtn, { borderColor: colors.line }]}
                      >
                        <Text style={{ color: colors.inkBright, fontSize: 11 }}>
                          {t("runtimeStopContainer")}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          void (async () => {
                            setBusy(true);
                            try {
                              await destroyContainer(c.id);
                              setMessage(`destroyed:${c.id}`);
                            } catch (e) {
                              setMessage(e instanceof Error ? e.message : String(e));
                            } finally {
                              setBusy(false);
                            }
                          })();
                        }}
                        disabled={busy}
                        style={[styles.miniBtn, { borderColor: colors.line }]}
                      >
                        <Text style={{ color: colors.inkBright, fontSize: 11 }}>
                          {t("runtimeDestroyContainer")}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={{ color: colors.muted }}>{rt("noData")}</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.inkBright }]}>
          {t("runtimeProject")}
        </Text>
        <TextInput
          value={projectId}
          onChangeText={setProjectId}
          placeholder="project id"
          placeholderTextColor={colors.muted}
          style={[
            styles.input,
            {
              color: colors.inkBright,
              borderColor: colors.line,
              backgroundColor: colors.background,
            },
          ]}
          autoCapitalize="none"
        />
        <Text style={styles.helpText}>
          {{
            ru: "Действия привязаны к project id ниже. Сначала откройте сессию, затем контейнер/терминал.",
            uk: "Дії прив'язані до project id. Спочатку сесія, потім контейнер/термінал.",
            en: "Actions use the project id below. Open a session first, then container/terminal.",
          }[language]}
        </Text>
        <TouchableOpacity
          onPress={onOpenSession}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.accent }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="folder-open-outline" size={20} color={"#fff"} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: "#fff" }]}>{t("runtimeOpenSession")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "Создать/открыть builder-сессию проекта", uk: "Створити/відкрити сесію проєкту", en: "Create/open the project builder session" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void onLaunchUbuntu()}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="logo-ubuntu" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{busy ? "…" : t("runtimeLaunchUbuntu")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Запуск Ubuntu userspace для проекта", uk: "Запуск Ubuntu userspace для проєкту", en: "Start Ubuntu userspace for this project" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void onOpenTerminal()}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="terminal-outline" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{busy ? "…" : t("runtimeOpenTerminal")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Интерактивный терминал в контексте проекта", uk: "Інтерактивний термінал у контексті проєкту", en: "Interactive terminal in project context" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onCreateAgent}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="hardware-chip-outline" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{t("runtimeCreateAgent")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Фоновый агент, привязанный к проекту", uk: "Фоновий агент, прив'язаний до проєкту", en: "Background agent bound to the project" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void onLaunchKali()}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="skull-outline" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{busy ? "…" : t("runtimeLaunchKali")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Kali-образ (если доступен в registry)", uk: "Kali-образ (якщо є в registry)", en: "Kali image if available in registry" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void onRunProot()}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="git-network-outline" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{busy ? "…" : t("runtimeRunProot")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Автовыбор proot-контейнера Ubuntu", uk: "Автовибір proot-контейнера Ubuntu", en: "Auto-select Ubuntu proot container" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            void (async () => {
              setBusy(true);
              try {
                const path = await ensureRootfs("ubuntu");
                setMessage(`rootfs:${path}`);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })();
          }}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="cube-outline" size={20} color={colors.accent} />
            <View style={styles.actionTextCol}>
              <Text style={[styles.actionText, { color: colors.inkBright }]}>{t("runtimeEnsureRootfs")}</Text>
              <Text style={styles.actionHintMuted}>
                {{ ru: "Скачать/подготовить rootfs Ubuntu", uk: "Завантажити/підготувати rootfs Ubuntu", en: "Download/prepare Ubuntu rootfs" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.inkBright }]}>
          {rt("recovery")}
        </Text>
        <TouchableOpacity
          onPress={() => {
            try {
              const report = runFinalValidation();
              setMessage(
                {
                  ru: `Итоговая проверка: OK=${report.passed}, проблем=${report.failed}` +
                    (report.failed
                      ? ": " + report.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")
                      : ""),
                  uk: `Підсумкова перевірка: OK=${report.passed}, проблем=${report.failed}` +
                    (report.failed
                      ? ": " + report.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")
                      : ""),
                  en: `Final check: passed=${report.passed}, failed=${report.failed}` +
                    (report.failed
                      ? ": " + report.checks.filter((c) => !c.ok).map((c) => c.name).join(", ")
                      : ""),
                }[language],
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            }
          }}
          disabled={busy}
          style={[styles.actionFull, { backgroundColor: colors.accent }]}
        >
          <View style={styles.actionInner}>
            <Ionicons name="checkmark-done-outline" size={20} color="#fff" />
            <View style={styles.actionTextCol}>
              <Text style={styles.actionText}>{rt("finalValidation")}</Text>
              <Text style={styles.actionHint}>
                {{ ru: "Сводка Health + supervisor + journal", uk: "Зводка Health + supervisor + journal", en: "Health + supervisor + journal summary" }[language]}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
        <Text style={styles.helpText}>
          {{
            ru: "Быстрые действия восстановления без удаления проектов. Нажмите, если сессия или процессы «зависли».",
            uk: "Швидкі дії відновлення без видалення проєктів.",
            en: "Quick recovery actions that keep projects. Use if a session or processes are stuck.",
          }[language]}
        </Text>
        {listRecoveryActions().map((a) => {
          const labels: Record<string, { title: string; hint: string; icon: any }> = {
            recreate_session: {
              title: { ru: "Пересоздать сессию builder", uk: "Перестворити сесію builder", en: "Recreate builder session" }[language],
              hint: { ru: "Закрыть и открыть заново рабочую сессию", uk: "Закрити й відкрити робочу сесію", en: "Close and open a fresh builder session" }[language],
              icon: "refresh-outline",
            },
            clear_process_registry: {
              title: { ru: "Очистить реестр процессов", uk: "Очистити реєстр процесів", en: "Clear process registry" }[language],
              hint: { ru: "Сбросить список отслеживаемых процессов", uk: "Скинути список процесів", en: "Reset tracked process list" }[language],
              icon: "list-outline",
            },
            stop_all_containers: {
              title: { ru: "Остановить все контейнеры", uk: "Зупинити всі контейнери", en: "Stop all containers" }[language],
              hint: { ru: "Проекты на диске сохраняются", uk: "Проєкти на диску залишаються", en: "Projects on disk are kept" }[language],
              icon: "stop-circle-outline",
            },
            close_all_terminals: {
              title: { ru: "Закрыть все терминалы", uk: "Закрити всі термінали", en: "Close all terminals" }[language],
              hint: { ru: "Завершить Termux/терминальные сессии UI", uk: "Завершити термінальні сесії", en: "End Termux/UI terminal sessions" }[language],
              icon: "terminal-outline",
            },
            refresh_toolchains: {
              title: { ru: "Обновить toolchain", uk: "Оновити toolchain", en: "Refresh toolchains" }[language],
              hint: { ru: "Заново обнаружить Java/SDK/Gradle в среде", uk: "Знову знайти Java/SDK/Gradle", en: "Re-discover Java/SDK/Gradle" }[language],
              icon: "build-outline",
            },
            refresh_privileges: {
              title: { ru: "Перепроверить права", uk: "Перевірити права", en: "Re-detect privileges" }[language],
              hint: { ru: "Shizuku / Root / ADB заново", uk: "Shizuku / Root / ADB знову", en: "Shizuku / Root / ADB again" }[language],
              icon: "shield-checkmark-outline",
            },
            destroy_all_containers: {
              title: { ru: "Уничтожить контейнеры", uk: "Знищити контейнери", en: "Destroy all containers" }[language],
              hint: { ru: "Удалить instances; проекты не трогаем", uk: "Видалити instances; проєкти лишаються", en: "Remove instances; projects kept" }[language],
              icon: "trash-outline",
            },
          };
          const fallbackTitle =
            typeof a.description === "string"
              ? a.description
              : a.description && typeof a.description === "object" && "ru" in (a.description as object)
                ? String((a.description as Record<string, string>)[language] ?? (a.description as Record<string, string>).ru ?? a.id)
                : a.id;
          const L = labels[a.id] || {
            title: fallbackTitle,
            hint: a.id,
            icon: "ellipse-outline" as any,
          };
          return (
            <TouchableOpacity
              key={a.id}
              onPress={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const msg = await runRecovery(a.id);
                    setMessage(msg);
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
              disabled={busy}
              style={[styles.actionFull, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderColor: colors.line, borderWidth: 1 }]}
            >
              <View style={styles.actionInner}>
                <Ionicons name={L.icon} size={20} color={colors.accent} />
                <View style={styles.actionTextCol}>
                  <Text style={[styles.actionText, { color: colors.inkBright }]} numberOfLines={2}>{L.title}</Text>
                  <Text style={styles.actionHintMuted}>{L.hint}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="cloud-upload-outline" size={22} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("backupRestore")}</Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "Снимок данных AI Builder. Scope: full / projects / sessions / toolchains. Restore делает pre-backup текущего состояния.",
            uk: "Знімок даних. Restore робить pre-backup поточного стану.",
            en: "Snapshot of AI Builder data. Restore takes a pre-backup of current state first.",
          }[language]}
        </Text>
        <Text style={{ color: colors.muted, fontSize: 12, marginBottom: 4 }}>
          {{ ru: "Объём копии", uk: "Обсяг копії", en: "Backup scope" }[language]}
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
          {(["full", "projects", "sessions", "toolchains"] as const).map((s) => (
            <TouchableOpacity
              key={s}
              onPress={() => setBackupScope(s)}
              style={[styles.miniBtn, {
                borderColor: backupScope === s ? colors.accent : colors.line,
                backgroundColor: backupScope === s ? (colors.accentDim || colors.line) : "transparent",
              }]}
            >
              <Text style={{ color: backupScope === s ? colors.accent : colors.inkBright, fontSize: 12 }}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          value={backupPath}
          onChangeText={setBackupPath}
          placeholder={status ? `${status.home}/backups/manual-1` : "backup path"}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright, borderColor: colors.line }]}
          autoCapitalize="none"
        />
        <View style={styles.rowBtns}>
          <TouchableOpacity
            disabled={backupBusy}
            onPress={() => void onBackupCreate()}
            style={[styles.action, { backgroundColor: colors.accent, opacity: backupBusy ? 0.5 : 1 }]}
          >
            <Text style={styles.actionText}>{backupBusy ? "…" : rt("createFullBackup")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={backupBusy || !backupPath.trim()}
            onPress={() => void onBackupVerify()}
            style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line, opacity: !backupPath.trim() ? 0.45 : 1 }]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Проверить", uk: "Перевірити", en: "Verify" }[language]}
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity
          disabled={backupBusy || !backupPath.trim()}
          onPress={() => void onBackupRestore()}
          style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 8, opacity: !backupPath.trim() ? 0.45 : 1 }]}
        >
          <Text style={[styles.actionText, { color: colors.inkBright }]}>{rt("restoreBackup")}</Text>
        </TouchableOpacity>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            disabled={backupBusy}
            onPress={() => void (async () => {
              setBackupBusy(true);
              try {
                await withForegroundTask("backup", "Export profile", async () => {
                  const r = await getRuntimeFacade().exportProfile();
                  setMessage(r.message);
                  if (r.path) setBackupPath(r.path);
                });
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setBackupBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Экспорт профиля", uk: "Експорт профілю", en: "Export profile" }[language]}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={backupBusy || !backupPath.trim()}
            onPress={() => void (async () => {
              setBackupBusy(true);
              try {
                await withForegroundTask("restore", "Import profile", async () => {
                  const r = await getRuntimeFacade().importProfile(backupPath.trim());
                  setMessage(r.message);
                });
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setBackupBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line, opacity: !backupPath.trim() ? 0.45 : 1 }]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Импорт профиля", uk: "Імпорт профілю", en: "Import profile" }[language]}
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.muted, fontSize: 11, marginTop: 6 }}>
          {{
            ru: "Экспорт → /storage/emulated/0/Download/AIBuilder-profile-*.tar.gz (переживает переустановку). Импорт: укажите путь к tar.gz.",
            uk: "Експорт у Download/ (переживає перевстановлення).",
            en: "Export to Download/AIBuilder-profile-*.tar.gz (survives reinstall). Import: path to tar.gz.",
          }[language]}
        </Text>
        {backupInspect ? (
          <Text selectable style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>{backupInspect}</Text>
        ) : null}
        <View style={[styles.cardHeader, { marginTop: 12 }]}>
          <Ionicons name="list-outline" size={18} color={colors.accent} />
          <Text style={{ color: colors.inkBright, fontWeight: "700", fontSize: 14 }}>
            {{ ru: "Список бэкапов", uk: "Список бекапів", en: "Backup list" }[language]}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void onBackupRefreshList()}
          disabled={backupBusy}
          style={[styles.miniBtn, { borderColor: colors.line, alignSelf: "flex-start", marginBottom: 8 }]}
        >
          <Text style={{ color: colors.accent, fontSize: 12 }}>
            {{ ru: "Обновить список", uk: "Оновити список", en: "Refresh list" }[language]}
          </Text>
        </TouchableOpacity>
        {backupList.length === 0 ? (
          <Text style={{ color: colors.muted, fontSize: 12 }}>
            {{ ru: "Пока пусто — создайте бэкап или нажмите «Обновить список»", uk: "Порожньо — створіть бекап", en: "Empty — create a backup or refresh" }[language]}
          </Text>
        ) : (
          backupList.map((b) => (
            <TouchableOpacity
              key={b.path}
              onPress={() => setBackupPath(b.path)}
              style={{ marginBottom: 8, paddingVertical: 4 }}
            >
              <Text style={{ color: colors.inkBright, fontSize: 12, fontWeight: "600" }} numberOfLines={1}>
                {b.path.split("/").slice(-2).join("/")}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {b.scope || "?"} · {b.createdAt ? new Date(b.createdAt).toLocaleString() : "—"}
                {b.digest ? ` · ${(b.digest || "").slice(0, 8)}` : ""}
              </Text>
            </TouchableOpacity>
          ))
        )}
      </View>

      {lastBootInfo ? (
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <Ionicons name="time-outline" size={20} color={colors.accent} />
            <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("startupTrace")}</Text>
          </View>
          <Text style={{ color: colors.muted, fontSize: 12 }}>{lastBootInfo}</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{rt("userspaceRuntime")}</Text>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            disabled={busy}
            onPress={() => void (async () => {
              setBusy(true);
              try {
                const facade = getRuntimeFacade();
                const s = await facade.initUserspaceRuntime();
                const line = s.probes.map((p) => `${p.id}:${p.health}(${p.latencyMs}ms)`).join(" · ");
                const accel = s.probes.find((p: any) => p.id === "aib-native-accel");
                const accelNote = accel
                  ? `accel=${accel.health}`
                  : "accel=absent";
                setUserspaceSnap(`active=${s.activeBackend || "none"} · ${accelNote} · ${line}`);
                setMessage(
                  s.ready
                    ? `userspace ready · ${s.activeBackend} · ${accelNote}`
                    : `userspace not ready · ${accelNote}`,
                );
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.actionText}>{rt("probeBackends")}</Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: colors.muted, marginTop: 8 }}>
          {userspaceSnap || rt("userspaceHint")}
        </Text>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="heart-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>{rt("health")}</Text>
        </View>
        <Text style={styles.helpText}>
          {{ ru: "Проверка Termux, Java/Gradle/Node, userspace. «Исправить всё» запускает только безопасные рецепты.", uk: "Перевірка Termux і toolchain. «Виправити все» — лише безпечні рецепти.", en: "Probes Termux and toolchain. Repair all runs allowlisted recipes only." }[language]}
        </Text>
        <View style={styles.rowBtns}>
          <TouchableOpacity
            disabled={healthBusy}
            onPress={() => void (async () => {
              setHealthBusy(true);
              try {
                const facade = getRuntimeFacade();
                const rows = await facade.runHealthChecks();
                setHealthRows(rows.map((r) => ({ id: r.id, level: r.level, message: r.message, repairable: r.repairable })));
                setMessage(`health: ${rows.filter((x) => x.level === "ok").length}/${rows.length} ok`);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setHealthBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.accent }]}
          >
            <Text style={styles.actionText}>{healthBusy ? "…" : rt("runHealth")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={healthBusy || !healthRows.some((r) => r.repairable && r.level !== "ok")}
            onPress={() => void (async () => {
              setHealthBusy(true);
              try {
                const facade = getRuntimeFacade();
                const targets = healthRows.filter((r) => r.repairable && r.level !== "ok");
                for (const row of targets) {
                  await facade.repairHealth(row.id);
                }
                const rows = await facade.runHealthChecks();
                setHealthRows(rows.map((r) => ({ id: r.id, level: r.level, message: r.message, repairable: r.repairable })));
                try {
                  const fails = await facade.listOpenFailures();
                  setFailureRows((fails || []).slice(0, 12).map((f: any) => ({
                    id: f.id, code: f.code, component: f.component, message: f.message, at: f.at,
                  })));
                } catch { /* ignore */ }
                setMessage(`repair attempted: ${targets.length}`);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setHealthBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>{rt("repairAll")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            disabled={healthBusy}
            onPress={() => void (async () => {
              setHealthBusy(true);
              try {
                const facade = getRuntimeFacade();
                const out = await facade.exportHealthReport();
                setMessage(`health export: ${out.count} rules → ${out.path}`);
              } catch (e) {
                setMessage(e instanceof Error ? e.message : String(e));
              } finally {
                setHealthBusy(false);
              }
            })()}
            style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line }]}
          >
            <Text style={[styles.actionText, { color: colors.inkBright }]}>
              {{ ru: "Export", uk: "Export", en: "Export" }[language]}
            </Text>
          </TouchableOpacity>
        </View>
        {healthRows.length === 0 ? (
          <Text style={{ color: colors.muted, marginTop: 8 }}>{rt("healthHint")}</Text>
        ) : (
          healthRows.map((item) => (
            <View key={item.id} style={styles.diagRow}>
              <Text style={{ color: levelColor(item.level as any, colors), fontWeight: "700" }}>
                {item.level.toUpperCase()}
              </Text>
              <Text style={{ color: colors.inkBright, flex: 1 }}>
                [{item.id}] {item.message}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="warning-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>
            {{ ru: "Журнал сбоев", uk: "Журнал збоїв", en: "Failure journal" }[language]}
          </Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "Открытые (ещё не исправленные) записи из Health и recovery. Пусто — всё чисто.",
            uk: "Відкриті (ще не виправлені) записи Health і recovery.",
            en: "Open unrepaired entries from Health and recovery. Empty means clean.",
          }[language]}
        </Text>
        {failureRows.length === 0 ? (
          <Text style={{ color: colors.muted }}>
            {{ ru: "Нет открытых сбоев", uk: "Немає відкритих збоїв", en: "No open failures" }[language]}
          </Text>
        ) : (
          failureRows.map((f) => (
            <View key={f.id} style={{ marginBottom: 8 }}>
              <View style={styles.diagRow}>
                <Text style={{ color: colors.danger || "#f66", fontWeight: "700", fontSize: 11 }}>{f.code}</Text>
                <Text style={{ color: colors.inkBright, flex: 1, fontSize: 12 }}>
                  [{f.component}] {f.message}
                </Text>
              </View>
              <TouchableOpacity
                disabled={healthBusy}
                onPress={() => void (async () => {
                  setHealthBusy(true);
                  try {
                    const facade = getRuntimeFacade();
                    await facade.repairHealth(f.component);
                    const fails = await facade.listOpenFailures();
                    setFailureRows(
                      (fails || []).slice(0, 12).map((x: any) => ({
                        id: x.id,
                        code: x.code,
                        component: x.component,
                        message: x.message,
                        at: x.at,
                      })),
                    );
                    const rows = await facade.runHealthChecks();
                    setHealthRows(rows.map((r: any) => ({
                      id: r.id, level: r.level, message: r.message, repairable: r.repairable,
                    })));
                    setMessage(`repair: ${f.component}`);
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : String(e));
                  } finally {
                    setHealthBusy(false);
                  }
                })()}
                style={[styles.miniBtn, { borderColor: colors.line, alignSelf: "flex-start", marginTop: 4 }]}
              >
                <Text style={{ color: colors.accent, fontSize: 12, fontWeight: "600" }}>
                  {{ ru: "Исправить", uk: "Виправити", en: "Repair" }[language]}
                </Text>
              </TouchableOpacity>
            </View>
          ))
        )}
        <TouchableOpacity
          onPress={() => void (async () => {
            try {
              const facade = getRuntimeFacade();
              const fails = await facade.listOpenFailures();
              setFailureRows(
                (fails || []).slice(0, 12).map((f: any) => ({
                  id: f.id,
                  code: f.code,
                  component: f.component,
                  message: f.message,
                  at: f.at,
                })),
              );
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            }
          })()}
          style={[styles.action, { backgroundColor: colors.surfaceRaised ?? colors.surface, borderWidth: 1, borderColor: colors.line, marginTop: 8 }]}
        >
          <Text style={[styles.actionText, { color: colors.inkBright }]}>
            {{ ru: "Обновить", uk: "Оновити", en: "Refresh" }[language]}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
        <View style={styles.cardHeader}>
          <Ionicons name="analytics-outline" size={20} color={colors.accent} />
          <Text style={[styles.cardTitle, { color: colors.inkBright, marginBottom: 0 }]}>
            {rt("diagnostics")}
          </Text>
        </View>
        <Text style={styles.helpText}>
          {{
            ru: "Сводка статуса среды (HOME, процессы). Для живых проверок toolchain — блок Health выше.",
            uk: "Зведення статусу середовища. Живі перевірки toolchain — у блоці Health.",
            en: "Runtime status summary. Live toolchain probes are in the Health card above.",
          }[language]}
        </Text>
        {diagnostics?.items?.map((item, i) => (
          <View key={`${item.area}-${i}`} style={styles.diagRow}>
            <Text style={{ color: levelColor(item.level, colors), fontWeight: "700" }}>
              {item.level.toUpperCase()}
            </Text>
            <Text style={{ color: colors.inkBright, flex: 1 }}>
              [{item.area}] {item.message}
            </Text>
          </View>
        )) ?? <Text style={{ color: colors.muted }}>{rt("noData")}</Text>}
      </View>
    
      </>
      ) : null}

</ScrollView>
  );
}

function Row({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: Record<string, string>;
}) {
  return (
    <View style={styles.row}>
      <Text style={{ color: colors.muted, width: 100 }}>{label}</Text>
      <Text style={{ color: colors.inkBright, flex: 1 }} numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

function levelColor(level: string, colors: Record<string, string>) {
  if (level === "error") return colors.danger ?? "#f66";
  if (level === "warn") return "#e6a700";
  if (level === "ok") return colors.accent;
  return colors.muted;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "700" },
  btn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  cardTitle: { fontSize: 15, fontWeight: "700", marginBottom: 4 },
  row: { flexDirection: "row", gap: 8, alignItems: "flex-start" },
  multilineInput: { minHeight: 72, textAlignVertical: "top" },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  rowBtns: { flexDirection: "row", gap: 10, marginTop: 4 },
  action: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  actionFull: {
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginTop: 6,
  },
  actionInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  actionTextCol: {
    flex: 1,
    gap: 2,
  },
  actionText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  actionHint: { color: "rgba(255,255,255,0.75)", fontSize: 11, lineHeight: 15, fontWeight: "500" },
  actionHintMuted: { color: "#94A3B8", fontSize: 11, lineHeight: 15, fontWeight: "500" },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  helpText: { color: "#94A3B8", fontSize: 12, lineHeight: 17, marginBottom: 8 },
  badgeRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 8 },
  badge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  diagRow: { flexDirection: "row", gap: 8, alignItems: "flex-start" },

  miniBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
