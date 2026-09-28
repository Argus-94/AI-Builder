import { useCallback, useEffect, useRef, useState, type ComponentProps } from "react";
import { AppState, Linking, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Clipboard from "expo-clipboard";
import { useLanguage } from "../components/LanguageContext";
import { useTheme } from "../components/ThemeContext";
import { useTermuxContext } from "../components/TermuxContext";
import { useDialog } from "../components/DialogContext";
import { useAppSettingsContext } from "../components/AppSettingsContext";
import { SystemPromptDialog } from "../components/SystemPromptDialog";
import { RECOMMENDED_TERMUX_SUPER_PROMPT, type PromptLang } from "../lib/ide-core-prompt";
import {
  canInstallPackages,
  downloadAddon,
  launchApkInstall,
  getAddonFallbackPage,
  getAddonStatus,
  cancelAddonDownload,
  openUnknownSourcesSettings,
  getSupportedAbis,
  type AddonId,
} from "../lib/termux-addon-installer";
import {
  getTermuxNative,
  isNativeModuleAvailable,
  checkTermuxReadiness,
  type TermuxReadiness,
} from "../lib/termux-bridge";
import { persistentLogger } from "../lib/persistent-logger";
import { errorMessage } from "../lib/error-utils";

interface AddonCardProps {
  number: number;
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  version: string | null;
  installed: boolean;
  installing: boolean;
  progress: number;
  actionLabel: string;
  installedLabel: string;
  cancelLabel: string;
  onInstall: () => void;
  onCancel?: () => void;
}

function AddonCard(props: AddonCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.number, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.numberText, { color: colors.inkBright }]}>{props.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{props.title}</Text>
        </View>
        <View
          style={[
            styles.badge,
            { backgroundColor: props.installed ? "rgba(34,197,94,0.18)" : props.installing ? "rgba(251,191,36,0.18)" : colors.dangerDim },
          ]}
        >
          <Text
            style={{
              color: props.installed ? colors.success : props.installing ? colors.warning : colors.danger,
              fontWeight: "800",
              fontSize: 12,
            }}
          >
            {props.installed ? props.version || props.installedLabel : props.installing ? `${Math.round(props.progress * 100)}%` : "НЕТ"}
          </Text>
        </View>
      </View>

      <View style={styles.descriptionRow}>
        <Ionicons name={props.icon} size={22} color={colors.muted} />
        <Text style={[styles.description, { color: colors.muted }]}>{props.description}</Text>
      </View>

      {props.installing ? (
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}
          onPress={() => props.onCancel?.()}
          activeOpacity={0.8}
        >
          <Ionicons name="close-circle-outline" size={20} color={colors.danger} />
          <Text style={[styles.primaryButtonText, { color: colors.danger }]}>{props.cancelLabel}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          style={[
            styles.primaryButton,
            {
              backgroundColor: props.installed ? colors.accentDim : colors.accent,
              borderColor: colors.accent,
            },
          ]}
          onPress={props.onInstall}
          activeOpacity={0.8}
        >
          <Ionicons name={props.installed ? "checkmark-circle-outline" : "download-outline"} size={20} color={props.installed ? colors.accent : colors.background} />
          <Text style={[styles.primaryButtonText, { color: props.installed ? colors.accent : colors.background }]}>
            {props.installed ? props.installedLabel : props.actionLabel}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

interface CommandCardProps {
  number: number;
  icon: ComponentProps<typeof Ionicons>["name"];
  title: string;
  description: string;
  command: string;
  buttonLabel: string;
  onPress: () => void;
}

function CommandCard(props: CommandCardProps) {
  const { colors } = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.number, { backgroundColor: colors.surfaceRaised }]}>
          <Text style={[styles.numberText, { color: colors.inkBright }]}>{props.number}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{props.title}</Text>
        </View>
      </View>

      <View style={styles.descriptionRow}>
        <Ionicons name={props.icon} size={22} color={colors.muted} />
        <Text style={[styles.description, { color: colors.muted }]}>{props.description}</Text>
      </View>

      <View style={[styles.commandBox, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
        <Text style={[styles.commandText, { color: colors.inkBright }]} selectable>
          {props.command}
        </Text>
      </View>

      <TouchableOpacity
        style={[styles.primaryButton, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
        onPress={props.onPress}
        activeOpacity={0.8}
      >
        <Ionicons name="copy-outline" size={20} color={colors.accent} />
        <Text style={[styles.primaryButtonText, { color: colors.accent }]}>{props.buttonLabel}</Text>
      </TouchableOpacity>
    </View>
  );
}

const UPDATE_ENV_COMMAND = "yes | pkg update -y && yes | pkg upgrade -y";
const SETUP_COMMANDS = [
  {
    id: "termux-api",
    icon: "hardware-chip-outline",
    titleKey: "termuxCmdApiTitle" as const,
    descKey: "termuxCmdApiDescription" as const,
    command: "pkg install termux-api -y",
  },
  {
    id: "setup-storage",
    icon: "folder-open-outline",
    titleKey: "termuxCmdStorageTitle" as const,
    descKey: "termuxCmdStorageDescription" as const,
    command: "termux-setup-storage",
  },
  {
    id: "allow-external",
    icon: "shield-checkmark-outline",
    titleKey: "termuxCmdAllowTitle" as const,
    descKey: "termuxCmdAllowDescription" as const,
    command: 'echo "allow-external-apps=true" >> ~/.termux/termux.properties',
  },
  {
    id: "reload-settings",
    icon: "reload-outline",
    titleKey: "termuxCmdReloadTitle" as const,
    descKey: "termuxCmdReloadDescription" as const,
    command: "termux-reload-settings",
  },
];

export default function TermuxSettingsScreen() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { enabled: termuxEnabled, checking: termuxChecking, setEnabled: setTermuxEnabled } = useTermuxContext();
  const { showDialog } = useDialog();
  const settings = useAppSettingsContext();
  const termuxAgentPrompt = String(settings?.termuxAgentPrompt ?? "");
  const setTermuxAgentPrompt =
    typeof settings?.setTermuxAgentPrompt === "function"
      ? settings.setTermuxAgentPrompt
      : (_: string) => {};
  const clearTermuxAgentPrompt =
    typeof settings?.clearTermuxAgentPrompt === "function"
      ? settings.clearTermuxAgentPrompt
      : () => {};
  const insets = useSafeAreaInsets();
  const [termuxPromptDialogVisible, setTermuxPromptDialogVisible] = useState(false);
  const [abis, setAbis] = useState<string[]>([]);
  const [shizuku, setShizuku] = useState({ installed: false, version: null as string | null });
  const [boot, setBoot] = useState({ installed: false, version: null as string | null });
  const [termux, setTermux] = useState({ installed: false, version: null as string | null });
  const [installing, setInstalling] = useState<AddonId | null>(null);
  const [progress, setProgress] = useState(0);
  const pendingInstall = useRef<AddonId | null>(null);
  const [bridgeAvailable, setBridgeAvailable] = useState(() => isNativeModuleAvailable());
  const [readiness, setReadiness] = useState<TermuxReadiness | null>(null);
  const [rechecking, setRechecking] = useState(false);

  const refresh = useCallback(async () => {
    setBridgeAvailable(isNativeModuleAvailable());
    const [arch, termuxStatus, s, b, ready] = await Promise.all([
      getSupportedAbis(),
      getAddonStatus("termux"),
      getAddonStatus("shizuku"),
      getAddonStatus("termuxBoot"),
      checkTermuxReadiness({ deep: true }).catch(() => ({ ready: false, reasons: ["native_module_missing"] as TermuxReadiness["reasons"] })),
    ]);
    setAbis(arch);
    setTermux(termuxStatus);
    setShizuku(s);
    setBoot(b);
    setReadiness(ready);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const install = useCallback(async (id: AddonId) => {
    if (installing) return;
    const allowed = await canInstallPackages();
    if (!allowed) {
      pendingInstall.current = id;
      showDialog(
        t("termuxUnknownAppsTitle"),
        t("termuxUnknownAppsMessage"),
        [
          { text: t("cancel"), style: "cancel" },
          { text: t("termuxOpenInstallSettings"), onPress: () => { void openUnknownSourcesSettings(); } },
        ]
      );
      return;
    }

    setInstalling(id);
    setProgress(0.1);
    try {
      // 1) Только скачивание — системный установщик ещё НЕ открывается.
      const result = await downloadAddon(id, (p) => setProgress(p));
      setProgress(1);
      persistentLogger.markAppEvent("TERMUX_ADDON_DOWNLOAD_READY", { addon: id, version: result.version, asset: result.assetName });

      // 2) Диалог: OK → открыть системное окно установки; Отмена → ничего.
      showDialog(
        t("termuxInstallStartedTitle"),
        t("termuxInstallStartedMessage", { version: result.version }),
        [
          {
            text: t("cancel"),
            style: "cancel",
            onPress: () => {
              persistentLogger.markAppEvent("TERMUX_ADDON_INSTALL_CANCELLED", { addon: id, version: result.version });
            },
          },
          {
            text: "OK",
            onPress: () => {
              void (async () => {
                try {
                  await launchApkInstall(result.uri, id);
                  persistentLogger.markAppEvent("TERMUX_ADDON_INSTALL_REQUESTED", {
                    addon: id,
                    version: result.version,
                    asset: result.assetName,
                  });
                } catch (err: unknown) {
                  persistentLogger.add("error", "TermuxAddonInstaller", `launch ${id}: ${errorMessage(err)}`, "app");
                  showDialog(
                    t("termuxInstallFailedTitle"),
                    `${errorMessage(err)}\n\n${t("termuxInstallFallbackHint")}`,
                    [
                      { text: t("cancel"), style: "cancel" },
                      { text: t("termuxOpenSourcePage"), onPress: () => Linking.openURL(getAddonFallbackPage(id)).catch(() => {}) },
                    ]
                  );
                } finally {
                  await refresh();
                }
              })();
            },
          },
        ]
      );
      await refresh();
    } catch (error: unknown) {
      const msg = errorMessage(error);
      if (msg === "DOWNLOAD_CANCELLED") {
        persistentLogger.markAppEvent("TERMUX_ADDON_DOWNLOAD_CANCELLED", { addon: id });
        return;
      }
      persistentLogger.add("error", "TermuxAddonInstaller", `${id}: ${msg}`, "app");
      showDialog(
        t("termuxInstallFailedTitle"),
        `${errorMessage(error)}\n\n${t("termuxInstallFallbackHint")}`,
        [
          { text: t("cancel"), style: "cancel" },
          { text: t("termuxOpenSourcePage"), onPress: () => Linking.openURL(getAddonFallbackPage(id)).catch(() => {}) },
        ]
      );
    } finally {
      setInstalling(null);
      setProgress(0);
    }
  }, [installing, refresh, showDialog, t]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      await refresh();
      if (pendingInstall.current) {
        const id = pendingInstall.current;
        pendingInstall.current = null;
        if (await canInstallPackages()) void install(id);
      }
    });
    return () => sub.remove();
  }, [install, refresh]);

  const openTermux = async () => {
    const native = getTermuxNative();
    if (native?.openPackage) {
      await native.openPackage("com.termux").catch(() => Linking.openURL("https://github.com/termux/termux-app/releases").catch(() => {}));
      persistentLogger.markAppEvent("TERMUX_OPEN_REQUESTED");
      return;
    }
    await Linking.openURL("https://github.com/termux/termux-app/releases").catch(() => {});
  };

  const copyAndOpenTermux = async (command: string, eventName: string) => {
    try {
      await Clipboard.setStringAsync(command);
      persistentLogger.markAppEvent(eventName, { command });
      persistentLogger.add("info", "TermuxSettings", t("termuxCommandsCopiedLog"), "app");
      // Только копирование + открытие Termux — без блокирующего диалога.
      // Пользователь сразу вставляет команду в Termux (long-press → Paste).
      await openTermux();
    } catch (error: unknown) {
      persistentLogger.add("error", "TermuxSettings", `copy/open: ${errorMessage(error)}`, "app");
      showDialog(t("termuxInstallFailedTitle"), errorMessage(error), [{ text: "OK" }]);
    }
  };

  const cancelInstall = useCallback(async () => {
    await cancelAddonDownload();
    setInstalling(null);
    setProgress(0);
    persistentLogger.add("info", "TermuxSettings", "Addon download cancelled by user", "app");
  }, []);

  const reasonLabel = useCallback(
    (code: TermuxReadiness["reasons"][number]) => {
      switch (code) {
        case "not_android":
          return t("termuxReasonNotAndroid");
        case "native_module_missing":
          return t("termuxReasonNativeMissing");
        case "termux_not_installed":
          return t("termuxReasonNotInstalled");
        case "run_command_permission_missing":
          return t("termuxReasonPermissionMissing");
        case "run_command_probe_failed":
          return t("termuxReasonProbeFailed");
        default:
          return t("termuxReasonUnknown");
      }
    },
    [t]
  );

  const recheckReadiness = useCallback(async () => {
    if (rechecking) return;
    setRechecking(true);
    try {
      await refresh();
      const r = await checkTermuxReadiness({ deep: true });
      setReadiness(r);
      persistentLogger.markAppEvent("TERMUX_READINESS_RECHECK", { ready: r.ready, reasons: r.reasons });
      if (r.ready) {
        showDialog(t("termuxRecheckTitle"), t("termuxRecheckReady"), [{ text: "OK" }]);
      } else {
        const lines = r.reasons.map((x) => `• ${reasonLabel(x)}`).join("\n");
        showDialog(t("termuxRecheckTitle"), `${t("termuxRecheckNotReady")}\n\n${lines}`, [{ text: "OK" }]);
      }
    } catch (e: unknown) {
      showDialog(t("termuxRecheckTitle"), errorMessage(e), [{ text: "OK" }]);
    } finally {
      setRechecking(false);
    }
  }, [rechecking, refresh, showDialog, t, reasonLabel]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 12, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.intro, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
          <View style={[styles.introIcon, { backgroundColor: colors.accentDim }]}><Ionicons name="terminal-outline" size={25} color={colors.accent} /></View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.introTitle, { color: colors.inkBright }]}>{t("termuxSettings")}</Text>
            <Text style={[styles.introText, { color: colors.muted }]}>{t("termuxSettingsDescription")}</Text>
            <Text style={[styles.archText, { color: colors.accent }]}>{t("termuxDetectedArch")}: {abis.length ? abis.join(", ") : "—"}</Text>
          </View>
        </View>


        {!bridgeAvailable ? (
          <View style={[styles.banner, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}>
            <Ionicons name="warning-outline" size={22} color={colors.danger} />
            <Text style={[styles.bannerText, { color: colors.inkBright }]}>{t("termuxBridgeMissingBanner")}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.number, { backgroundColor: readiness?.ready ? "rgba(34,197,94,0.18)" : colors.surfaceRaised }]}>
              <Ionicons
                name={
                  readiness == null
                    ? "hourglass-outline"
                    : readiness.ready
                    ? "checkmark-circle"
                    : "alert-circle-outline"
                }
                size={20}
                color={
                  readiness == null
                    ? colors.muted
                    : readiness.ready
                    ? colors.success
                    : colors.warning
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{t("termuxReadinessTitle")}</Text>
            </View>
            <View
              style={[
                styles.badge,
                {
                  backgroundColor: readiness?.ready
                    ? "rgba(34,197,94,0.18)"
                    : bridgeAvailable
                    ? "rgba(251,191,36,0.18)"
                    : colors.dangerDim,
                },
              ]}
            >
              <Text
                style={{
                  color: readiness?.ready ? colors.success : bridgeAvailable ? colors.warning : colors.danger,
                  fontWeight: "800",
                  fontSize: 12,
                }}
              >
                {readiness?.ready ? "OK" : bridgeAvailable ? "…" : "N/A"}
              </Text>
            </View>
          </View>
          <View style={styles.descriptionRow}>
            <Ionicons name="pulse-outline" size={22} color={colors.muted} />
            <Text style={[styles.description, { color: colors.muted }]}>
              {bridgeAvailable
                ? readiness?.ready
                  ? t("termuxReadinessOk")
                  : t("termuxReadinessHint")
                : t("termuxBridgeMissingBanner")}
            </Text>
          </View>
          {bridgeAvailable && readiness && !readiness.ready && readiness.reasons.length > 0 ? (
            <Text style={[styles.description, { color: colors.warning, marginTop: 6 }]}>
              {readiness.reasons.map((x) => `• ${reasonLabel(x)}`).join("\n")}
              {readiness.probeDetail ? `\n(${readiness.probeDetail})` : ""}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.accentDim, borderColor: colors.accent, opacity: rechecking ? 0.7 : 1 }]}
            onPress={() => void recheckReadiness()}
            disabled={rechecking}
            activeOpacity={0.8}
          >
            <Ionicons name={rechecking ? "hourglass-outline" : "refresh-outline"} size={20} color={colors.accent} />
            <Text style={[styles.primaryButtonText, { color: colors.accent }]}>
              {rechecking ? t("termuxRechecking") : t("termuxRecheckButton")}
            </Text>
          </TouchableOpacity>
        </View>

        {/* === Промпт агента Termux (пользовательский) === */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.number, { backgroundColor: colors.surfaceRaised }]}>
              <Ionicons name="sparkles-outline" size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{t("termuxAgentPromptSection")}</Text>
            </View>
          </View>
          <View style={styles.descriptionRow}>
            <Ionicons name="document-text-outline" size={22} color={colors.muted} />
            <Text style={[styles.description, { color: colors.muted }]}>{t("termuxAgentPromptSectionDesc")}</Text>
          </View>
          <Text style={[styles.description, { color: colors.inkBright, marginTop: 8 }]}>
            {termuxAgentPrompt.trim()
              ? t("termuxAgentPromptSet", { count: termuxAgentPrompt.trim().length })
              : t("termuxAgentPromptNotSet")}
          </Text>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.accentDim, borderColor: colors.accent }]}
              onPress={() => setTermuxPromptDialogVisible(true)}
              activeOpacity={0.8}
            >
              <Ionicons name="create-outline" size={18} color={colors.accent} />
              <Text style={{ color: colors.accent, fontWeight: "800", fontSize: 13 }}>{t("termuxAgentPromptButton")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}
              onPress={() => {
                const lang = (language === "en" || language === "ru" ? language : "uk") as PromptLang;
                setTermuxAgentPrompt(RECOMMENDED_TERMUX_SUPER_PROMPT[lang] || RECOMMENDED_TERMUX_SUPER_PROMPT.en);
              }}
              activeOpacity={0.8}
            >
              <Ionicons name="flash-outline" size={18} color={colors.inkBright} />
              <Text style={{ color: colors.inkBright, fontWeight: "800", fontSize: 12 }} numberOfLines={1}>
                {t("termuxAgentPromptInsertSuper")}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* === Карточки 1–9 по порядку === */}
        {/* 1. Termux — официальный F-Droid runtime APK */}
        <AddonCard
          number={1}
          icon="terminal-outline"
          title={t("termuxRuntimeTitle")}
          description={t("termuxRuntimeDescription")}
          version={termux.version}
          installed={termux.installed}
          installing={installing === "termux"}
          progress={progress}
          actionLabel={t("termuxInstall")}
          installedLabel={t("termuxInstalled")}
          cancelLabel={t("termuxDownloadCancel")}
          onCancel={() => void cancelInstall()}
          onInstall={() => void install("termux")}
        />

        {/* 2. Обновить окружение Termux */}
        <CommandCard
          number={2}
          icon="refresh-circle-outline"
          title={t("termuxEnvironmentUpdateTitle")}
          description={t("termuxEnvironmentUpdateCopyDescription")}
          command={UPDATE_ENV_COMMAND}
          buttonLabel={t("termuxCopyAndOpen")}
          onPress={() => void copyAndOpenTermux(UPDATE_ENV_COMMAND, "TERMUX_ENV_UPDATE_COPY")}
        />

        {/* 3. termux-api | 4. setup-storage | 5. allow-external | 6. reload-settings */}
        {SETUP_COMMANDS.map((cmd, idx) => (
          <CommandCard
            key={cmd.id}
            number={3 + idx}
            icon={cmd.icon}
            title={t(cmd.titleKey)}
            description={t(cmd.descKey)}
            command={cmd.command}
            buttonLabel={t("termuxCopyAndOpen")}
            onPress={() => void copyAndOpenTermux(cmd.command, `TERMUX_CMD_COPY_${cmd.id}`)}
          />
        ))}

        {/* 7. Сессия Termux (On / Off) */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.cardHeader}>
            <View style={[styles.number, { backgroundColor: colors.surfaceRaised }]}>
              <Text style={[styles.numberText, { color: colors.inkBright }]}>7</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.inkBright }]}>{t("termuxSessionControl")}</Text>
            </View>
          </View>
          <View style={styles.descriptionRow}>
            <Ionicons name="flash-outline" size={22} color={colors.muted} />
            <Text style={[styles.description, { color: colors.muted }]}>{termuxEnabled ? t("termuxStatusOn") : t("termuxStatusOff")}</Text>
          </View>
          <View style={styles.controlRow}>
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: termuxEnabled ? colors.accentDim : colors.chipBg, borderColor: termuxEnabled ? colors.accent : colors.line }]}
              onPress={() => void setTermuxEnabled(true)}
              disabled={termuxChecking}
            >
              <Ionicons name="power-outline" size={18} color={termuxEnabled ? colors.accent : colors.muted} />
              <Text style={{ color: termuxEnabled ? colors.accent : colors.muted, fontWeight: "800" }}>{t("termuxOn")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.controlButton, { backgroundColor: !termuxEnabled ? colors.dangerDim : colors.chipBg, borderColor: !termuxEnabled ? colors.danger : colors.line }]}
              onPress={() => void setTermuxEnabled(false)}
              disabled={termuxChecking}
            >
              <Ionicons name="power-outline" size={18} color={!termuxEnabled ? colors.danger : colors.muted} />
              <Text style={{ color: !termuxEnabled ? colors.danger : colors.muted, fontWeight: "800" }}>{t("termuxOff")}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 8. Termux:Boot */}
        <AddonCard
          number={8}
          icon="power-outline"
          title={t("termuxBootTitle")}
          description={t("termuxBootDescription")}
          version={boot.version}
          installed={boot.installed}
          installing={installing === "termuxBoot"}
          progress={progress}
          actionLabel={t("termuxInstall")}
          installedLabel={t("termuxInstalled")}
          cancelLabel={t("termuxDownloadCancel")}
          onCancel={() => void cancelInstall()}
          onInstall={() => void install("termuxBoot")}
        />

        {/* 9. Shizuku */}
        <AddonCard
          number={9}
          icon="apps-outline"
          title={t("shizukuTitle")}
          description={t("shizukuDescription")}
          version={shizuku.version}
          installed={shizuku.installed}
          installing={installing === "shizuku"}
          progress={progress}
          actionLabel={t("termuxInstall")}
          installedLabel={t("termuxInstalled")}
          cancelLabel={t("termuxDownloadCancel")}
          onCancel={() => void cancelInstall()}
          onInstall={() => void install("shizuku")}
        />
      </ScrollView>

      <SystemPromptDialog
        visible={termuxPromptDialogVisible}
        value={termuxAgentPrompt}
        onSave={(next) => setTermuxAgentPrompt(next)}
        onClear={() => clearTermuxAgentPrompt()}
        onRequestClose={() => setTermuxPromptDialogVisible(false)}
        titleKey="termuxAgentPromptDialogTitle"
        descKey="termuxAgentPromptSectionDesc"
        placeholderKey="termuxAgentPromptPlaceholder"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  intro: { flexDirection: "row", gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 12 },
  introIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  introTitle: { fontSize: 17, fontWeight: "800", marginBottom: 3 },
  introText: { fontSize: 13, lineHeight: 19 },
  archText: { fontSize: 11, fontWeight: "700", marginTop: 7 },
  card: { borderRadius: 18, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  number: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  numberText: { fontSize: 18, fontWeight: "800" },
  cardTitle: { fontSize: 17, fontWeight: "800" },
  badge: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 20, minWidth: 68, alignItems: "center" },
  descriptionRow: { flexDirection: "row", gap: 11, marginTop: 13, alignItems: "flex-start" },
  description: { flex: 1, fontSize: 14, lineHeight: 21 },
  primaryButton: { marginTop: 14, minHeight: 48, borderRadius: 14, borderWidth: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryButtonText: { fontSize: 14, fontWeight: "800" },
  commandBox: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1 },
  commandText: { fontSize: 13, fontFamily: "monospace", lineHeight: 20 },
  banner: { flexDirection: "row", gap: 10, padding: 12, borderRadius: 14, borderWidth: 1, marginBottom: 12, alignItems: "flex-start" },
  bannerText: { flex: 1, fontSize: 13, lineHeight: 19, fontWeight: "600" },
  versionPlain: { marginTop: 16, alignItems: "center", justifyContent: "center", width: "100%" },
  versionPlainText: { fontSize: 16, fontWeight: "800", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 22, overflow: "hidden", textAlign: "center", minWidth: 160 },
  controlRow: { flexDirection: "row", gap: 8, marginTop: 14 },
  controlButton: { flex: 1, minHeight: 46, borderRadius: 13, borderWidth: 1, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
});
