import { useCallback, useEffect, useState } from "react";
// ReactNode for SettingsGroup
import type { ReactNode } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, TextInput, Platform, PermissionsAndroid, Linking, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { applyAgentPreset, AGENT_PRESETS, getActiveAgentPresetId, type AgentPresetId } from "../lib/agent-presets";
import { loadPluginState, setPluginSafeMode, listActivePluginSkills } from "../lib/aib-plugins";
import { describeBackupVsSecrets } from "../lib/backup-secrets-policy";
import { loadLanBridgeConfig, setLanBridgeEnabled } from "../lib/lan-status-bridge";
import { getSecurityPolicySummary } from "../lib/security-policy";
import {
  loadStatusOverlayEnabled,
  saveStatusOverlayEnabled,
} from "../components/RuntimeStatusOverlay";
import { useAppSettingsContext } from "../components/AppSettingsContext";
import { useLoggerContext } from "../components/LoggerContext";
import { useDialog } from "../components/DialogContext";
import { useLanguage } from "../components/LanguageContext";
import { errorMessage } from "../lib/error-utils";
import { checkTermuxReadiness, isNativeModuleAvailable } from "../lib/termux-bridge";

import { useTheme } from "../components/ThemeContext";
import { ProgressBar } from "../components/ProgressBar";
import { Checkbox } from "../components/Checkbox";
import { NumberField } from "../components/NumberField";
import { SystemPromptDialog } from "../components/SystemPromptDialog";
import { OpenRouterModelsDialog } from "../components/OpenRouterModelsDialog";
import { CustomProviderDialog } from "../components/CustomProviderDialog";
import { OpenCodeModelsDialog } from "../components/OpenCodeModelsDialog";
import { validateOpenRouterApiKey } from "../lib/online-model";
import { formatFileSize, formatSpeed } from "../lib/text-file";
import type { AppLanguage } from "../lib/i18n";
import type { AgentIntelligenceSettings } from "../lib/agent-intelligence";
import { ensureBackgroundSurvival } from "../lib/background-survival";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  type VoiceSettings,
} from "../lib/voice-runtime";

type AgentIntelOption = {
  key: keyof AgentIntelligenceSettings;
  icon: string;
  title: Record<AppLanguage, string>;
  desc: Record<AppLanguage, string>;
};

/** Справка «Интеллект агента»: имя + зачем нужно (понятным языком). */
const AGENT_INTELLIGENCE_OPTIONS: AgentIntelOption[] = [
  {
    key: "memory",
    icon: "🧠",
    title: { ru: "Память проекта", uk: "Памʼять проєкту", en: "Project memory" },
    desc: {
      ru: "Запоминает факты и уроки по текущему проекту между сообщениями, чтобы агент не начинал «с нуля» каждый раз.",
      uk: "Памʼятає факти й уроки поточної проєкту між повідомленнями, щоб агент не починав «з нуля» щоразу.",
      en: "Remembers facts and lessons about the current project across messages so the agent does not start from scratch every time.",
    },
  },
  {
    key: "hashline",
    icon: "🔐",
    title: { ru: "Безопасные правки файлов", uk: "Безпечні правки файлів", en: "Safe file edits" },
    desc: {
      ru: "Меняет код только через проверку версии строки. Снижает риск затереть чужие правки или испортить файл «вслепую».",
      uk: "Змінює код лише з перевіркою версії рядка. Зменшує ризик затерти чужі правки або зіпсувати файл «наосліп».",
      en: "Edits code only after verifying line versions. Lowers the risk of overwriting changes or corrupting a file blindly.",
    },
  },
  {
    key: "subagents",
    icon: "👥",
    title: { ru: "Помощники-субагенты", uk: "Помічники-субагенти", en: "Helper subagents" },
    desc: {
      ru: "Перед сложной задачей несколько «помощников» (архитектура, безопасность, сборка, UI) коротко осматривают проект. Тратит доп. запросы к модели.",
      uk: "Перед складною задачею кілька «помічників» (архітектура, безпека, збірка, UI) коротко оглядають проєкт. Витрачає додаткові запити до моделі.",
      en: "Before a hard task, helper roles (architecture, security, build, UI) briefly inspect the project. Uses extra model requests.",
    },
  },
  {
    key: "reviewer",
    icon: "🧪",
    title: { ru: "Ревьюер (проверка после)", uk: "Ревʼюер (перевірка після)", en: "Reviewer (after task)" },
    desc: {
      ru: "После задачи ещё раз просматривает результат и пишет замечания. Нужен вместе с «Автопроверкой после задачи». Тратит запросы.",
      uk: "Після задачі ще раз переглядає результат і пише зауваження. Потрібен разом із «Автоперевіркою після задачі». Витрачає запити.",
      en: "After a task, reviews the result and notes issues. Works with “Review after task”. Uses model requests.",
    },
  },
  {
    key: "advisor",
    icon: "👁️",
    title: { ru: "Советник (контроль по ходу)", uk: "Радник (контроль під час роботи)", en: "Advisor (watchdog)" },
    desc: {
      ru: "Периодически во время работы агента проверяет, нет ли риска или тупика. Доп. вызовы модели — на free-лимитах лучше выключить.",
      uk: "Періодично під час роботи агента перевіряє, чи немає ризику або тупика. Додаткові виклики моделі — на free-лімітах краще вимкнути.",
      en: "During the agent run, periodically checks for risks or dead ends. Extra model calls — better off on free-tier limits.",
    },
  },
  {
    key: "ast",
    icon: "🌳",
    title: { ru: "Умный разбор кода (AST)", uk: "Розумний розбір коду (AST)", en: "Smart code parse (AST)" },
    desc: {
      ru: "Позволяет агенту точнее искать и править структуру кода (функции, классы), а не только «текст как есть».",
      uk: "Допомагає агенту точніше шукати й правити структуру коду (функції, класи), а не лише «текст як є».",
      en: "Helps the agent find and edit code structure (functions, classes) more precisely than plain text search.",
    },
  },
  {
    key: "lsp",
    icon: "🔎",
    title: { ru: "Проверка TypeScript (LSP)", uk: "Перевірка TypeScript (LSP)", en: "TypeScript checks (LSP)" },
    desc: {
      ru: "Подтягивает ошибки типов и подсказки по TypeScript-проектам (если в Termux есть tsc / language server).",
      uk: "Підтягує помилки типів і підказки для TypeScript-проєктів (якщо в Termux є tsc / language server).",
      en: "Pulls type errors and hints for TypeScript projects (when tsc / a language server is available in Termux).",
    },
  },
  {
    key: "github",
    icon: "🐙",
    title: { ru: "Работа с GitHub", uk: "Робота з GitHub", en: "GitHub tools" },
    desc: {
      ru: "Читает файлы, дерево репозитория, PR и issues с GitHub, когда задача про удалённый код (нужен интернет).",
      uk: "Читає файли, дерево репозиторію, PR і issues з GitHub, коли задача про віддалений код (потрібен інтернет).",
      en: "Reads files, repo tree, PRs and issues from GitHub when the task is about remote code (needs internet).",
    },
  },
  {
    key: "streamRules",
    icon: "🛡️",
    title: { ru: "Фильтр ответов модели", uk: "Фільтр відповідей моделі", en: "Reply filter" },
    desc: {
      ru: "Отсекает мусорные или опасные ответы модели по правилам, чтобы агент меньше «галлюцинировал» успех.",
      uk: "Відсікає сміттєві або небезпечні відповіді моделі за правилами, щоб агент менше «галюцинував» успіх.",
      en: "Filters junk or unsafe model replies by rules so the agent claims success less often without evidence.",
    },
  },
  {
    key: "autoPreflight",
    icon: "🚦",
    title: { ru: "Автопроверка перед задачей", uk: "Автоперевірка перед задачею", en: "Check before task" },
    desc: {
      ru: "Перед стартом собирает контекст (память, субагенты). Улучшает качество, но тратит лишние запросы — на free выключайте.",
      uk: "Перед стартом збирає контекст (памʼять, субагенти). Покращує якість, але витрачає зайві запити — на free вимикайте.",
      en: "Before starting, gathers context (memory, subagents). Improves quality but uses extra requests — turn off on free tier.",
    },
  },
  {
    key: "autoPostReview",
    icon: "✅",
    title: { ru: "Автопроверка после задачи", uk: "Автоперевірка після задачі", en: "Check after task" },
    desc: {
      ru: "После выполнения запускает ревью результата. Полезно для сложных правок; на free-лимитах лучше выключить.",
      uk: "Після виконання запускає ревʼю результату. Корисно для складних правок; на free-лімітах краще вимкнути.",
      en: "After the task, runs a result review. Useful for complex edits; turn off on free-tier limits.",
    },
  },
];

/** Collapsible settings group (accordion header + body). */
function SettingsGroup({
  title,
  icon,
  expanded,
  onToggle,
  colors,
  children,
}: {
  title: string;
  /** Ionicons glyph name shown in the section header. */
  icon?: keyof typeof Ionicons.glyphMap;
  expanded: boolean;
  onToggle: () => void;
  colors: { inkBright: string; muted: string; line: string; surface: string; accent: string; accentDim: string };
  children: ReactNode;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity
        onPress={onToggle}
        activeOpacity={0.72}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 14,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.line,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", flex: 1, paddingRight: 8, gap: 10 }}>
          {icon ? (
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: colors.accentDim,
              }}
            >
              <Ionicons name={icon} size={20} color={colors.accent} />
            </View>
          ) : null}
          <Text style={{ color: colors.inkBright, fontSize: 15, fontWeight: "700", flex: 1 }} numberOfLines={1}>
            {title}
          </Text>
        </View>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={20}
          color={colors.muted}
        />
      </TouchableOpacity>
      {expanded ? (
        <View style={{ gap: 10, paddingTop: 10, paddingBottom: 4 }}>{children}</View>
      ) : null}
    </View>
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { logInfo, logError } = useLoggerContext();
  const { showDialog } = useDialog();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const {
    model, downloadModel, cancelDownload, deleteModel, importModel, importMmproj, exportModel, exportMmproj, loadModel, unloadModel,
    mode, setMode,
    deviceProfile, recommended,
    localParams, localParamsAuto, setLocalParams, resetLocalParamsToAuto,
    localGenParams, setLocalGenParams,
    onlineModel, setOnlineApiKey,
    customProvider1, customProvider2, activeCustomSlot, setActiveCustomSlot, setCustomProviderSlot,
    openCode, setOpenCode,
    openRouterModelId, setOpenRouterModel, onlineGenParams, setOnlineGenParams,
    openRouterModelStatus, openRouterModelsCheckedAt, checkingOpenRouterModels, checkOpenRouterModelsNow,
    openRouterModelOverrides, saveOpenRouterModelOverride,
    localModelOverride, setLocalModelOverride,
    systemPrompt, setSystemPrompt, clearSystemPrompt,
    agentIntelligence, setAgentIntelligence,
  } = useAppSettingsContext();

  const [systemPromptDialogVisible, setSystemPromptDialogVisible] = useState(false);
  const [openRouterDialogVisible, setOpenRouterDialogVisible] = useState(false);
  const [custom1DialogVisible, setCustom1DialogVisible] = useState(false);
  const [custom2DialogVisible, setCustom2DialogVisible] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [packsBridgeOk, setPacksBridgeOk] = useState(false);
  const [packsReady, setPacksReady] = useState(false);
  const [statusOverlayEnabled, setStatusOverlayEnabled] = useState(false);
  const [lanBridgeEnabled, setLanBridgeEnabledState] = useState(false);
  const [pluginSafeMode, setPluginSafeModeState] = useState(true);

  useEffect(() => {
    void loadStatusOverlayEnabled().then(setStatusOverlayEnabled);
    void loadLanBridgeConfig().then((cfg) => setLanBridgeEnabledState(!!cfg.enabled));
    void loadPluginState().then((s) => setPluginSafeModeState(!!s.safeMode));
  }, []);

  const refreshPackReadinessState = useCallback(async () => {
    setPacksBridgeOk(isNativeModuleAvailable());
    try {
      const r = await checkTermuxReadiness({ deep: true });
      setPacksReady(r.ready);
    } catch {
      setPacksReady(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => refreshPackReadinessState(), [refreshPackReadinessState])
  );


  useEffect(() => {
    loadVoiceSettings().then(setVoiceSettings);
  }, []);

  const updateVoiceSettings = (partial: Partial<VoiceSettings>) => {
    setVoiceSettings((prev) => {
      const next = { ...prev, ...partial };
      saveVoiceSettings(next);
      return next;
    });
  };
  const [custom1Draft, setCustom1Draft] = useState({
    name: "", baseUrl: "", modelId: "", extraHeadersJson: "", chatPath: "/chat/completions", apiKey: "",
  });
  const [custom2Draft, setCustom2Draft] = useState({
    name: "", baseUrl: "", modelId: "", extraHeadersJson: "", chatPath: "/chat/completions", apiKey: "",
  });
  const [openCodeDraft, setOpenCodeDraft] = useState({
    // ИСПРАВЛЕНО: api.opencode.ai не существует — реальный шлюз OpenCode Zen
    // находится на https://opencode.ai/zen/v1 (см. lib/custom-provider.ts).
    baseUrl: "https://opencode.ai/zen/v1",
    modelId: "",
    apiKey: "",
  });
  const [openCodeDialogVisible, setOpenCodeDialogVisible] = useState(false);
  useEffect(() => {
    setCustom1Draft({
      name: customProvider1.name || "", baseUrl: customProvider1.baseUrl || "", modelId: customProvider1.modelId || "",
      extraHeadersJson: customProvider1.extraHeadersJson || "", chatPath: customProvider1.chatPath || "/chat/completions", apiKey: customProvider1.apiKey || "",
    });
  }, [customProvider1.name, customProvider1.baseUrl, customProvider1.modelId, customProvider1.extraHeadersJson, customProvider1.chatPath, customProvider1.apiKey]);
  useEffect(() => {
    setCustom2Draft({
      name: customProvider2.name || "", baseUrl: customProvider2.baseUrl || "", modelId: customProvider2.modelId || "",
      extraHeadersJson: customProvider2.extraHeadersJson || "", chatPath: customProvider2.chatPath || "/chat/completions", apiKey: customProvider2.apiKey || "",
    });
  }, [customProvider2.name, customProvider2.baseUrl, customProvider2.modelId, customProvider2.extraHeadersJson, customProvider2.chatPath, customProvider2.apiKey]);
  useEffect(() => {
    if (openCode) {
      setOpenCodeDraft({
        baseUrl: openCode.baseUrl || "https://opencode.ai/zen/v1",
        modelId: openCode.modelId || "",
        apiKey: openCode.apiKey || "",
      });
    }
  }, [openCode?.baseUrl, openCode?.modelId, openCode?.apiKey]);

  const [offlineEditOpen, setOfflineEditOpen] = useState(false);
  /** Accordion groups on Settings screen — only one "level" of structure. */
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    device: false,
    agent: false,
    offline: false,
    online: false,
    voice: false,
    security: false,
    background: false,
    network: false,
    interface: false,
    about: false,
  });
  const toggleSection = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const [offlineNameDraft, setOfflineNameDraft] = useState("");
  const [offlineUrlDraft, setOfflineUrlDraft] = useState("");

  const localModelSizeLabel = t("localModelSizeLabel", {
    total: formatFileSize(model.llmBytes + model.mmprojBytes, language),
    llm: formatFileSize(model.llmBytes, language),
    vision: formatFileSize(model.mmprojBytes, language),
  });
  const localModelDescription =
    /coder|0\.5b|1\.5b|imported|q3_k|q2_k/i.test(model.name) ||
    (model.llmBytes > 0 && model.llmBytes < 1_200_000_000)
      ? ({
          ru: `Импорт GGUF с диска: «${model.name}». Имя и квантизация определены по файлу. Загрузите в память перед чатом.`,
          uk: `Імпорт GGUF: «${model.name}». Ім'я/квантизація з файлу.`,
          en: `Imported GGUF: "${model.name}". Name/quant from filename. Load into memory before chat.`,
        } as const)[language]
      : t("localModelDescription");
  const onlineModelDescription = t("onlineModelDescription");
  const onlineModelContextLabel = t("onlineModelContextLabel", {
    tokens: onlineModel.contextLength.toLocaleString(
      language === "en" ? "en-US" : language === "ru" ? "ru-RU" : "uk-UA"
    ),
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [apiKeyDraft, setApiKeyDraft] = useState(onlineModel.apiKey);
  const [checkingApiKey, setCheckingApiKey] = useState(false);
  const [apiKeyCheckResult, setApiKeyCheckResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleDownloadModel = async () => {
    // Загрузка выполняется в sandbox/cache приложения; широкое storage
    // permission для неё не требуется.
    if (model.downloading || model.loading) {
      logInfo("Settings", "Download already in progress — ignore extra taps");
      return;
    }
    logInfo("Settings", `${t("downloadModel")}: ${model.name}`);
    const ok = await downloadModel();
    if (ok) {
      logInfo("Settings", t("modelDownloadedOk") || "Модель скачана на диск. Нажмите «Загрузить в память».");
    } else {
      logInfo(
        "Settings",
        (t("modelDownloadFailedLog") || "Скачивание модели не удалось") +
          (model.error ? `: ${model.error}` : " — см. ошибку на экране / лог Settings")
      );
    }
  };

  const handleCancelDownload = () => {
    cancelDownload();
    logInfo("Settings", t("downloadCancelled"));
  };

  const handleDeleteModel = () => {
    showDialog(t("deleteModelTitle"), t("deleteModelConfirm", { name: model.name, size: localModelSizeLabel }), [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: () => {
        deleteModel();
        logInfo("Settings", t("modelDeleted"));
      }},
    ]);
  };

  const handleImportModel = async () => {
    if (model.downloading || model.importing) return;
    logInfo("Settings", t("importModel"));
    const ok = await importModel();
    if (ok) {
      logInfo("Settings", t("modelImportedOk"));
    } else if (!model.error) {
      logInfo("Settings", t("modelImportCancelled"));
    } else {
      logInfo("Settings", `${t("importModel")}: ${model.error}`);
    }
  };

  const handleImportMmproj = async () => {
    if (model.downloading || model.importing) return;
    logInfo("Settings", t("importMmproj"));
    const ok = await importMmproj();
    if (ok) {
      logInfo("Settings", t("modelMmprojImportedOk"));
    } else if (!model.error) {
      logInfo("Settings", t("modelImportCancelled"));
    } else {
      logInfo("Settings", `${t("importMmproj")}: ${model.error}`);
    }
  };

  const handleExportModel = async () => {
    if (model.exporting) return;
    logInfo("Settings", t("exportModel"));
    const ok = await exportModel();
    if (ok) {
      logInfo("Settings", t("modelExportedOk"));
    } else if (model.error) {
      logInfo("Settings", `${t("exportModel")}: ${model.error}`);
    }
  };

  const handleExportMmproj = async () => {
    if (model.exporting) return;
    logInfo("Settings", t("exportMmproj"));
    const ok = await exportMmproj();
    if (ok) {
      logInfo("Settings", t("modelMmprojExportedOk"));
    } else if (model.error) {
      logInfo("Settings", `${t("exportMmproj")}: ${model.error}`);
    }
  };

  const handleLoadModel = async () => {
    if (model.loading || model.downloading) {
      logInfo("Settings", "Load already in progress — ignore extra taps");
      return;
    }
    logInfo("Settings", t("loadToMemory"));
    const ok = await loadModel();
    if (ok) {
      logInfo("Settings", t("modelLoaded"));
    } else {
      logInfo("Settings", t("modelLoadFailedLog") || "Загрузка модели в память не удалась — см. ошибку на экране.");
    }
  };

  const handleUnloadModel = async () => {
    await unloadModel();
    logInfo("Settings", t("modelUnloaded"));
  };

  const handleSaveApiKey = () => {
    setOnlineApiKey(apiKeyDraft.trim());
    logInfo("Settings", t("saveKeySuccess"));
  };

  const handleCheckApiKey = async () => {
    const key = apiKeyDraft.trim();
    if (!key) {
      setApiKeyCheckResult({ valid: false, message: t("apiKeyEmpty") });
      return;
    }
    setCheckingApiKey(true);
    setApiKeyCheckResult(null);
    try {
      const result = await validateOpenRouterApiKey(key);
      setApiKeyCheckResult({
        valid: result.valid,
        message: result.valid ? t("apiKeyValid") : t("apiKeyInvalid"),
      });
      logInfo("Settings", `OpenRouter key check: ${result.valid ? "valid" : "invalid"} (${result.message})`);
    } catch (err: unknown) {
      setApiKeyCheckResult({ valid: false, message: t("apiKeyInvalid") });
      logError("Settings", `OpenRouter key check failed: ${errorMessage(err)}`);
    } finally {
      setCheckingApiKey(false);
    }
  };

  const handleSaveSystemPrompt = (next: string) => {
    setSystemPrompt(next.trim());
    logInfo("Settings", t("logSystemPromptSaved"));
  };

  const handleClearSystemPrompt = () => {
    clearSystemPrompt();
    logInfo("Settings", t("logSystemPromptCleared"));
  };

  const handleSelectOpenRouterModel = (id: string) => {
    setOpenRouterModel(id);
    logInfo("Settings", `${t("logOpenRouterModelChanged")} ${id}`);
  };

  const progressSublabel = model.downloading
    ? `${formatFileSize(model.bytesWrittenOverall, language)} / ${formatFileSize(model.totalBytesOverall, language)}` +
      (model.speedBytesPerSec > 0 ? ` · ${formatSpeed(model.speedBytesPerSec, language)}` : "") +
      (model.stage === "llm" ? ` · ${t("modelFile")}` : ` · ${t("visionModule")}`)
    : undefined;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 32 + insets.bottom }]}>

        <SettingsGroup
          title={t("phoneParams")}
          icon="phone-portrait-outline"
          expanded={!!openSections.device}
          onToggle={() => toggleSection("device")}
          colors={colors}
        >
        <View style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="hardware-chip-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{t("phoneParams")}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]}>{t("determiningPhone")}</Text>
            </View>
          </View>
          {deviceProfile ? (
            <>
              <Text style={[styles.deviceLine, { color: colors.inkBright }]}>
                {deviceProfile.modelName || t("unknownModel")}
                {deviceProfile.manufacturer ? ` (${deviceProfile.manufacturer})` : ""}
              </Text>
              <Text style={[styles.deviceLine, { color: colors.inkBright }]}>
                {t("ram")}: {deviceProfile.totalMemoryGB ? `≈${deviceProfile.totalMemoryGB.toFixed(1)} ${t("gb")}` : t("notDetermined")}
                {deviceProfile.osVersion ? ` · ${t("os")} ${deviceProfile.osVersion}` : ""}
              </Text>
              {!deviceProfile.isArm64Compatible && (
                <Text style={styles.warnText}>{t("arm64Warning")}</Text>
              )}
              {recommended && <Text style={styles.deviceNote}>{t(recommended.noteKey, recommended.noteParams)}</Text>}
            </>
          ) : (
            <Text style={[styles.deviceLine, { color: colors.inkBright }]}>{t("determiningPhone")}</Text>
          )}
        </View>
        </SettingsGroup>

        <SettingsGroup
          title={{ ru: "Настройки агента", uk: "Налаштування агента", en: "Agent settings" }[language]}
          icon="hardware-chip-outline"
          expanded={!!openSections.agent}
          onToggle={() => toggleSection("agent")}
          colors={colors}
        >
        <Text style={[styles.section, { color: colors.muted, marginTop: 0 }]}>{t("systemPromptSection")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="chatbox-ellipses-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{t("systemPromptSection")}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]}>{t("systemPromptSectionDesc")}</Text>
            </View>
          </View>
          <Text style={[styles.statusLine, { color: colors.muted }]}>
            {systemPrompt.trim()
              ? t("systemPromptSet", { count: systemPrompt.trim().length })
              : t("systemPromptNotSet")}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { marginTop: 4, backgroundColor: colors.accentDim }]}
            onPress={() => setSystemPromptDialogVisible(true)}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("systemPromptButton")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>{{ru:"Интеллект агента",uk:"Інтелект агента",en:"Agent intelligence"}[language]}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="sparkles-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{{ru:"Интеллект агента",uk:"Інтелект агента",en:"Agent intelligence"}[language]}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]}>{{
                ru: "Дополнительные «умения» агента Termux. Включайте по необходимости: часть пунктов тратит лишние запросы к модели (на free лучше выключить).",
                uk: "Додаткові «вміння» агента Termux. Вмикайте за потреби: частина пунктів витрачає зайві запити до моделі (на free краще вимкнути).",
                en: "Extra Termux-agent abilities. Enable as needed: some options use extra model requests (better off on free tier).",
              }[language]}</Text>
            </View>
          </View>
          {AGENT_INTELLIGENCE_OPTIONS.map((opt) => (
            <Checkbox
              key={opt.key}
              checked={!!agentIntelligence[opt.key]}
              onPress={() => setAgentIntelligence({ [opt.key]: !agentIntelligence[opt.key] })}
              label={`${opt.icon} ${opt.title[language]}`}
              description={opt.desc[language]}
            />
          ))}
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={{ ru: "Офлайн-модель", uk: "Офлайн-модель", en: "Offline model" }[language]}
          icon="cube-outline"
          expanded={!!openSections.offline}
          onToggle={() => toggleSection("offline")}
          colors={colors}
        >
        <Text style={[styles.section, { color: colors.muted, marginTop: 0 }]}>{t("offlineModel")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox
            checked={mode === "local"}
            onPress={() => setMode("local")}
            label={t("useAsActive")}
          />
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="phone-portrait-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{model.name}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]}>{localModelSizeLabel}</Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]}>{localModelDescription}</Text>
            </View>
            <TouchableOpacity
              style={styles.editModelBtn}
              onPress={() => {
                setOfflineEditOpen((v) => !v);
                setOfflineNameDraft(localModelOverride?.name || model.name);
                setOfflineUrlDraft(localModelOverride?.llmUrl || "");
              }}
            >
              <Text style={styles.editModelBtnText}>{t("modelEdit")}</Text>
            </TouchableOpacity>
          </View>
          {offlineEditOpen && (
            <View style={styles.editModelPanel}>
              <Text style={styles.urlLabel}>{t("modelEditNameLabel")}</Text>
              <TextInput
                style={[styles.urlInput, { backgroundColor: colors.inputBg, color: colors.inkBright, borderColor: colors.line }]}
                value={offlineNameDraft}
                onChangeText={setOfflineNameDraft}
                placeholder={model.name}
                placeholderTextColor="#64748B"
              />
              <Text style={styles.urlLabel}>{t("modelEditUrlLabel")}</Text>
              <TextInput
                style={[styles.urlInput, { backgroundColor: colors.inputBg, color: colors.inkBright, borderColor: colors.line }]}
                value={offlineUrlDraft}
                onChangeText={setOfflineUrlDraft}
                autoCapitalize="none"
                autoCorrect={false}
                placeholder="https://…/model.gguf"
                placeholderTextColor="#64748B"
              />
              <TouchableOpacity
                style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]}
                onPress={() => {
                  setLocalModelOverride({
                    name: offlineNameDraft.trim() || model.name,
                    llmUrl: offlineUrlDraft.trim(),
                  });
                  setOfflineEditOpen(false);
                  logInfo("Settings", t("modelEditSavedLog"));
                }}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("modelEditSave")}</Text>
              </TouchableOpacity>
            </View>
          )}

          {model.error && <Text style={styles.errorText}>⚠ {model.error}</Text>}

          {model.downloading && (
            <ProgressBar
              progress={model.progress}
              label={`${t("downloadModel")} — ${model.progress}%`}
              sublabel={progressSublabel}
            />
          )}

          <View style={styles.modelActions}>
            {!model.downloaded && !model.downloading && (
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={handleDownloadModel}>
                <Text style={[styles.primaryButtonText, { color: colors.background }]}>{t("downloadModel")}</Text>
              </TouchableOpacity>
            )}
            {model.downloading && (
              <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={handleCancelDownload}>
                <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("cancelDownload")}</Text>
              </TouchableOpacity>
            )}
            {model.downloaded && !model.loaded && (
              <TouchableOpacity style={[styles.primaryButton, { backgroundColor: colors.accent }]} onPress={handleLoadModel} disabled={model.loading}>
                <Text style={[styles.primaryButtonText, { color: colors.background }]}>{model.loading ? t("loadingToMemory") : t("loadToMemory")}</Text>
              </TouchableOpacity>
            )}
            {model.loaded && (
              <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={handleUnloadModel}>
                <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("unloadFromMemory")}</Text>
              </TouchableOpacity>
            )}
            {/* Импорт / экспорт: две пары кнопок — основной GGUF и второй
                файл (mmproj/vision). Любая модель; второй файл лучше брать
                совместимым с первой. */}
            {!model.downloading && (
              <View style={styles.transferBlock}>
                <Text style={[styles.transferTitle, { color: colors.muted }]}>
                  {t("modelTransferTitle")}
                </Text>

                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]}
                  onPress={handleImportModel}
                  disabled={model.importing}
                >
                  {model.importing && model.importingTarget === "llm" ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("importModel")}</Text>
                  )}
                </TouchableOpacity>
                <Text style={[styles.transferHint, { color: colors.muted }]}>
                  {t("importModelHint")}
                </Text>

                <TouchableOpacity
                  style={[styles.secondaryButton, { backgroundColor: colors.accentDim, marginTop: 8 }]}
                  onPress={handleImportMmproj}
                  disabled={model.importing}
                >
                  {model.importing && model.importingTarget === "mmproj" ? (
                    <ActivityIndicator size="small" color={colors.accent} />
                  ) : (
                    <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("importMmproj")}</Text>
                  )}
                </TouchableOpacity>
                <Text style={[styles.transferHint, { color: colors.muted }]}>
                  {t("importMmprojHint")}
                </Text>

                {model.downloaded && (
                  <>
                    <TouchableOpacity
                      style={[styles.secondaryButton, { backgroundColor: colors.accentDim, marginTop: 12 }]}
                      onPress={handleExportModel}
                      disabled={model.exporting}
                    >
                      {model.exporting && model.exportingTarget === "llm" ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("exportModel")}</Text>
                      )}
                    </TouchableOpacity>
                    <Text style={[styles.transferHint, { color: colors.muted }]}>
                      {t("exportModelHint")}
                    </Text>

                    <TouchableOpacity
                      style={[
                        styles.secondaryButton,
                        {
                          backgroundColor: colors.accentDim,
                          marginTop: 8,
                          opacity: model.mmprojBytes > 0 ? 1 : 0.55,
                        },
                      ]}
                      onPress={handleExportMmproj}
                      disabled={model.exporting || model.mmprojBytes <= 0}
                    >
                      {model.exporting && model.exportingTarget === "mmproj" ? (
                        <ActivityIndicator size="small" color={colors.accent} />
                      ) : (
                        <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("exportMmproj")}</Text>
                      )}
                    </TouchableOpacity>
                    <Text style={[styles.transferHint, { color: colors.muted }]}>
                      {t("exportMmprojHint")}
                    </Text>
                  </>
                )}
              </View>
            )}
            {model.downloaded && !model.downloading && (
              <TouchableOpacity
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: colors.dangerDim,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  },
                ]}
                onPress={handleDeleteModel}
              >
                <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>
                  {t("deleteFromDisk")}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          <Text style={[styles.statusLine, { color: colors.muted }]}>
            {model.downloaded ? t("downloaded") : t("notDownloaded")}
            {" · "}
            {model.loaded ? t("inMemory") : t("notInMemory")}
          </Text>

          <View style={[styles.divider, { backgroundColor: colors.line }]} />
          <View style={styles.paramsHeader}>
            <Text style={styles.paramsTitle}>{t("modelParams")}</Text>
            <View style={styles.autoRow}>
              <Text style={styles.autoLabel}>{localParamsAuto ? t("autoByPhone") : t("manualMode")}</Text>
              {!localParamsAuto && (
                <TouchableOpacity onPress={resetLocalParamsToAuto}>
                  <Text style={styles.autoResetText}>{t("resetToAuto")}</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>

          <NumberField
            label={t("nCtx")}
            value={localParams.nCtx}
            step={512}
            min={512}
            max={8192}
            onChange={(v) => setLocalParams({ nCtx: v })}
          />
          <NumberField
            label={t("nThreads")}
            value={localParams.nThreads}
            step={1}
            min={1}
            max={12}
            onChange={(v) => setLocalParams({ nThreads: v })}
          />
          <NumberField
            label={t("nGpuLayers")}
            value={localParams.nGpuLayers}
            step={1}
            min={0}
            max={40}
            onChange={(v) => setLocalParams({ nGpuLayers: v })}
          />
          {localParams.nGpuLayers > 0 && (
            <Text style={styles.warnText}>{t("gpuWarning")}</Text>
          )}
          <NumberField
            label={t("temperature")}
            value={localGenParams.temperature}
            step={0.1}
            min={0}
            max={1.5}
            format={(v) => v.toFixed(1)}
            onChange={(v) => setLocalGenParams({ temperature: v })}
          />
          <NumberField
            label={t("maxTokens")}
            value={localGenParams.maxTokens}
            step={128}
            min={128}
            max={2048}
            onChange={(v) => setLocalGenParams({ maxTokens: v })}
          />
          <NumberField
            label={t("topP")}
            value={localGenParams.topP}
            step={0.05}
            min={0.1}
            max={1}
            format={(v) => v.toFixed(2)}
            onChange={(v) => setLocalGenParams({ topP: v })}
          />
          {model.loaded && !localParamsAuto && (
            <Text style={styles.hintText}>{t("paramsHint")}</Text>
          )}
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={{ ru: "Настройки модели (онлайн)", uk: "Налаштування моделі (онлайн)", en: "Online model settings" }[language]}
          icon="cloud-outline"
          expanded={!!openSections.online}
          onToggle={() => toggleSection("online")}
          colors={colors}
        >
        <Text style={[styles.section, { color: colors.muted, marginTop: 0 }]}>{t("openRouterSectionTitle")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox
            checked={mode === "online"}
            onPress={() => setMode("online")}
            label={t("useAsActive")}
          />
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="cloud-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{onlineModel.name}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]}>{onlineModel.provider} · {onlineModelContextLabel}</Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]}>{onlineModelDescription}</Text>
            </View>
          </View>

          <Text style={styles.urlLabel}>{t("apiKeyLabel")}</Text>
          <View style={styles.apiKeyRow}>
            <TextInput
              style={[styles.apiKeyInput, { backgroundColor: colors.inputBg, color: colors.inkBright, borderColor: colors.line }]}
              placeholder="sk-or-v1-…"
              placeholderTextColor="#64748B"
              value={apiKeyDraft}
              onChangeText={(v) => { setApiKeyDraft(v); setApiKeyCheckResult(null); }}
              secureTextEntry={!showApiKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity style={styles.eyeBtn} onPress={() => setShowApiKey((v) => !v)}>
              <Text style={styles.eyeBtnText}>{showApiKey ? "🙈" : "👁"}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.modelActions}>
            <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={handleSaveApiKey}>
              <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("saveKey")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.secondaryButton, { backgroundColor: colors.accentDim, flexDirection: "row", alignItems: "center", gap: 6, opacity: checkingApiKey ? 0.6 : 1 }]}
              onPress={handleCheckApiKey}
              disabled={checkingApiKey}
            >
              {checkingApiKey && <ActivityIndicator size="small" color={colors.accent} />}
              <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
                {checkingApiKey ? t("checkingApiKey") : t("checkApiKey")}
              </Text>
            </TouchableOpacity>
          </View>

          <Text style={[styles.statusLine, { color: colors.muted }]}>
            {onlineModel.hasApiKey ? t("keySet") : t("keyNotSet")}
          </Text>
          {apiKeyCheckResult && (
            <Text style={[styles.statusLine, { color: apiKeyCheckResult.valid ? "#0D9488" : "#F87171" }]}>
              {apiKeyCheckResult.message}
            </Text>
          )}

          <View style={[styles.divider, { backgroundColor: colors.line }]} />

          <Text style={[styles.paramsTitle, { color: colors.inkBright }]}>{t("openRouterModelsSection")}</Text>
          <Text style={[styles.modelDesc, { color: colors.muted }]}>{t("openRouterModelsSectionDesc")}</Text>
          <Text style={[styles.statusLine, { color: colors.muted }]}>
            {t("openRouterCurrentModelLabel")} {onlineModel.name}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.accentDim, alignSelf: "flex-start" }]}
            onPress={() => setOpenRouterDialogVisible(true)}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("openRouterChooseModelButton")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>{t("customProvider1Section")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox checked={mode === "custom" && activeCustomSlot === 1} onPress={() => setActiveCustomSlot(1)} label={t("useAsActiveAgent")} />
          <TouchableOpacity activeOpacity={0.75} onPress={() => setCustom1DialogVisible(true)} style={styles.deepSeekRow}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}><Ionicons name="options-outline" size={21} color={colors.accent} /></View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{t("customProvider1Title")}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]} numberOfLines={1}>{customProvider1.name || t("customProviderHint")}</Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]} numberOfLines={2}>{customProvider1.baseUrl || t("customProvider1Empty")}</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={() => setCustom1DialogVisible(true)}>
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("customConfigure")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>{t("customProvider2Section")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox checked={mode === "custom" && activeCustomSlot === 2} onPress={() => setActiveCustomSlot(2)} label={t("useAsActiveAgent")} />
          <TouchableOpacity activeOpacity={0.75} onPress={() => setCustom2DialogVisible(true)} style={styles.deepSeekRow}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}><Ionicons name="flash-outline" size={21} color={colors.accent} /></View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>{t("customProvider2Title")}</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]} numberOfLines={1}>{customProvider2.name || t("customProviderHint")}</Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]} numberOfLines={2}>
                {customProvider2.baseUrl || t("customProvider1Empty")}
              </Text>
            </View>
            <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={() => setCustom2DialogVisible(true)}>
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("customConfigure")}</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>{t("openCodeSection")}</Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox checked={mode === "opencode"} onPress={() => setMode("opencode")} label={t("useAsActive")} />
          <TouchableOpacity activeOpacity={0.75} onPress={() => setOpenCodeDialogVisible(true)} style={styles.deepSeekRow}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}><Ionicons name="code-slash-outline" size={21} color={colors.accent} /></View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>OpenCode</Text>
              <Text style={[styles.modelMeta, { color: colors.muted }]} numberOfLines={1}>{openCodeDraft.baseUrl}</Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]}>{openCode?.apiKey?.trim() ? t("keySet") : t("keyNotSet")}</Text>
            </View>
            <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]} onPress={() => setOpenCodeDialogVisible(true)}>
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>{t("saveKey")}</Text>
          </TouchableOpacity>
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={language === "en" ? "Voice & Speech" : language === "uk" ? "Голос і мовлення" : "Голос и речь"}
          icon="mic-outline"
          expanded={!!openSections.voice}
          onToggle={() => toggleSection("voice")}
          colors={colors}
        >
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="mic-outline" size={21} color={colors.accent} />
            </View>
            <View style={styles.modelInfo}>
              <Text style={[styles.modelName, { color: colors.inkBright }]}>
                {language === "en" ? "Voice Assistant & TTS" : language === "uk" ? "Голосовий асистент і озвучка" : "Голосовой ассистент и озвучка"}
              </Text>
              <Text style={[styles.modelDesc, { color: colors.muted }]}>
                {language === "en" ? "Real-time STT, continuous voice mode, and TTS speech synthesis" : language === "uk" ? "Розпізнавання голосу, голосовий режим і синтез мови" : "Распознавание речи, голосовой диалог и синтез речи"}
              </Text>
            </View>
          </View>

          <Checkbox
            checked={voiceSettings.autoSend}
            onPress={() => updateVoiceSettings({ autoSend: !voiceSettings.autoSend })}
            label={language === "en" ? "Auto-send after speech pauses" : language === "uk" ? "Автонадсилання після паузи в мові" : "Автоотправка после завершения речи"}
          />

          <Checkbox
            checked={voiceSettings.autoSpeakResponses}
            onPress={() => updateVoiceSettings({ autoSpeakResponses: !voiceSettings.autoSpeakResponses })}
            label={language === "en" ? "Read AI replies aloud (TTS)" : language === "uk" ? "Озвучувати відповіді ШІ (TTS)" : "Озвучивать ответы ИИ (TTS)"}
          />

          <Checkbox
            checked={voiceSettings.voiceConversationMode}
            onPress={() => updateVoiceSettings({ voiceConversationMode: !voiceSettings.voiceConversationMode })}
            label={language === "en" ? "Continuous voice conversation mode" : language === "uk" ? "Неперервний голосовий діалог" : "Непрерывный голосовой диалог"}
          />

          <Checkbox
            checked={voiceSettings.readCodeBlocks}
            onPress={() => updateVoiceSettings({ readCodeBlocks: !voiceSettings.readCodeBlocks })}
            label={language === "en" ? "Read code blocks aloud (by default filtered for brevity)" : language === "uk" ? "Озвучувати блоки коду (за замовчуванням скорочуються)" : "Озвучивать блоки кода (по умолчанию скрываются для краткости речи)"}
          />

          <Text style={[styles.urlLabel, { marginTop: 6 }]}>
            {language === "en" ? "Speech rate:" : language === "uk" ? "Швидкість мовлення:" : "Скорость речи:"}
          </Text>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {[0.75, 1.0, 1.25, 1.5].map((rate) => (
              <TouchableOpacity
                key={rate}
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: voiceSettings.ttsSpeed === rate ? colors.accent : colors.accentDim,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                  },
                ]}
                onPress={() => updateVoiceSettings({ ttsSpeed: rate })}
              >
                <Text
                  style={[
                    styles.secondaryButtonText,
                    { color: voiceSettings.ttsSpeed === rate ? colors.background : colors.accent },
                  ]}
                >
                  {rate}x
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={t("securitySection")}
          icon="shield-checkmark-outline"
          expanded={!!openSections.security}
          onToggle={() => toggleSection("security")}
          colors={colors}
        >
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={() => router.push("/signing-keys")}
          style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.line }]}
        >
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="key-outline" size={21} color={colors.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.infoText, { color: colors.inkBright }]}>{t("signingKeys")}</Text>
              <Text style={[styles.infoSub, { color: colors.muted }]}>{t("signingKeysDescription")}</Text>
            </View>
            <Ionicons name="chevron-forward" size={21} color={colors.muted} />
          </View>
        </TouchableOpacity>

        </SettingsGroup>

        <SettingsGroup
          title={{ ru: "Фон и батарея", uk: "Фон і батарея", en: "Background & battery" }[language]}
          icon="battery-charging-outline"
          expanded={!!openSections.background}
          onToggle={() => toggleSection("background")}
          colors={colors}
        >
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.modelName, { color: colors.inkBright }]}>
            {{ ru: "Выживание в фоне", uk: "Виживання у фоні", en: "Background survival" }[language]}
          </Text>
          <Text style={[styles.modelMeta, { color: colors.muted, marginBottom: 10 }]}>
            {{
              ru: "Отключите оптимизацию батареи и лимит данных для AI Builder, чтобы долгие сборки и агент не убивались системой. Не открывается автоматически при старте.",
              uk: "Вимкніть оптимізацію батареї та ліміт даних для AI Builder, щоб довгі збірки й агент не вбивалися системою. Не відкривається автоматично при старті.",
              en: "Disable battery optimization and data limits for AI Builder so long builds and the agent are not killed. Never opens automatically on startup.",
            }[language]}
          </Text>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]}
            onPress={() => void ensureBackgroundSurvival({ force: true })}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
              {{ ru: "Настроить выживание в фоне", uk: "Налаштувати виживання у фоні", en: "Configure background survival" }[language]}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.modelDesc, { color: colors.muted, marginTop: 6, fontSize: 11 }]}>
            {{
              ru: "Откроет системные экраны: батарея без ограничений → при необходимости сведения о приложении. Одного шага достаточно.",
              uk: "Відкриє системні екрани: батарея без обмежень → за потреби відомості про застосунок.",
              en: "Opens system screens: unrestricted battery → app details if needed. One step is enough.",
            }[language]}
          </Text>
        </View>

        
        <Text style={[styles.section, { color: colors.muted }]}>
          {{ ru: "Пресеты агента", uk: "Пресети агента", en: "Agent presets" }[language]}
        </Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.modelDesc, { color: colors.muted }]}>
            {{ ru: "Готовые профили интеллекта агента (поверх тумблеров).", uk: "Готові профілі інтелекту агента.", en: "Ready-made agent intelligence profiles." }[language]}
          </Text>
          {AGENT_PRESETS.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[styles.secondaryButton, { backgroundColor: colors.accentDim, marginTop: 6 }]}
              onPress={() => {
                void applyAgentPreset(p.id).then(() => {
                  logInfo("Settings", `agent preset ${p.id}`);
                });
              }}
            >
              <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
                {p.title[language === "uk" || language === "en" ? language : "ru"]}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }}>
                {p.description[language === "uk" || language === "en" ? language : "ru"]}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>
          {{ ru: "Плагины / safe mode", uk: "Плагіни / safe mode", en: "Plugins / safe mode" }[language]}
        </Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]}
            onPress={() => {
              void (async () => {
                const st = await loadPluginState();
                const next = !st.safeMode;
                await setPluginSafeMode(next);
                setPluginSafeModeState(next);
                logInfo("Settings", `plugins safeMode=${next}`);
              })();
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
              {{ ru: pluginSafeMode ? "Safe mode плагинов: ВКЛ" : "Safe mode плагинов: выкл", uk: pluginSafeMode ? "Safe mode: УВІМК" : "Safe mode: вимк", en: pluginSafeMode ? "Plugin safe mode: ON" : "Plugin safe mode: off" }[language]}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.modelDesc, { color: colors.muted, marginTop: 6 }]}>
            {{ ru: "В safe mode активны только встроенные skills. Политика shell: allowlist для Shizuku/plugin.", uk: "У safe mode лише вбудовані skills.", en: "Safe mode keeps builtin skills only. Shell policy allowlists Shizuku/plugin." }[language]}
          </Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
            policy cmds: {getSecurityPolicySummary().elevatedAllowCount}
          </Text>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>
          {{ ru: "Backup vs секреты", uk: "Backup vs секрети", en: "Backup vs secrets" }[language]}
        </Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.modelDesc, { color: colors.muted }]}>
            {describeBackupVsSecrets(language === "uk" || language === "en" ? language : "ru").note}
          </Text>
        </View>

        <Text style={[styles.section, { color: colors.muted }]}>
          {{ ru: "LAN status (opt-in)", uk: "LAN status (opt-in)", en: "LAN status (opt-in)" }[language]}
        </Text>
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <TouchableOpacity
            style={[styles.secondaryButton, { backgroundColor: colors.accentDim }]}
            onPress={() => {
              void (async () => {
                const cfg = await loadLanBridgeConfig();
                const next = await setLanBridgeEnabled(!cfg.enabled);
                setLanBridgeEnabledState(!!next.enabled);
                logInfo("Settings", `lanBridge enabled=${next.enabled}`);
              })();
            }}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.accent }]}>
              {{ ru: lanBridgeEnabled ? "LAN snapshot: ВКЛ" : "LAN snapshot: выкл", uk: lanBridgeEnabled ? "LAN snapshot: УВІМК" : "LAN snapshot: вимк", en: lanBridgeEnabled ? "LAN snapshot: ON" : "LAN snapshot: off" }[language]}
            </Text>
          </TouchableOpacity>
          <Text style={[styles.modelDesc, { color: colors.muted, marginTop: 6 }]}>
            {{ ru: "По умолчанию выкл. Публикует JSON-снимок + token; HTTP-сервер — через Termux при необходимости.", uk: "За замовчуванням вимк. JSON-знімок + token.", en: "Off by default. Publishes JSON snapshot + token; HTTP via Termux if needed." }[language]}
          </Text>
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={{ ru: "Интерфейс", uk: "Інтерфейс", en: "Interface" }[language]}
          icon="color-palette-outline"
          expanded={!!openSections.interface}
          onToggle={() => toggleSection("interface")}
          colors={colors}
        >
        <View style={[styles.modelCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Checkbox
            checked={statusOverlayEnabled}
            onPress={() => {
              const next = !statusOverlayEnabled;
              setStatusOverlayEnabled(next);
              void saveStatusOverlayEnabled(next);
              logInfo("Settings", `statusOverlay enabled=${next}`);
            }}
            label={{ ru: "Плавающий статус в чате", uk: "Плаваючий статус у чаті", en: "Floating status in chat" }[language]}
            description={{
              ru: "Кнопка/карточка поверх чата. Выключите, если мешает полю ввода.",
              uk: "Кнопка/картка поверх чату. Вимкніть, якщо заважає полю вводу.",
              en: "Floating card over chat. Turn off if it covers the input field.",
            }[language]}
          />
        </View>

        </SettingsGroup>

        <SettingsGroup
          title={t("aboutApp")}
          icon="information-circle-outline"
          expanded={!!openSections.about}
          onToggle={() => toggleSection("about")}
          colors={colors}
        >
        <View style={[styles.infoCard, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <View style={styles.settingsCardHeader}>
            <View style={[styles.deepSeekIcon, { backgroundColor: colors.accentDim }]}>
              <Ionicons name="information-circle-outline" size={21} color={colors.accent} />
            </View>
            <View>
              <Text style={[styles.infoText, { color: colors.inkBright }]}>{t("version")}</Text>
              <Text style={[styles.infoSub, { color: colors.muted }]}>{t("expoVersion")}</Text>
            </View>
          </View>
        </View>
        </SettingsGroup>
      </ScrollView>

      <SystemPromptDialog
        visible={systemPromptDialogVisible}
        value={systemPrompt}
        onSave={handleSaveSystemPrompt}
        onClear={handleClearSystemPrompt}
        onRequestClose={() => setSystemPromptDialogVisible(false)}
      />

      <OpenRouterModelsDialog
        visible={openRouterDialogVisible}
        selectedId={openRouterModelId}
        onSelect={handleSelectOpenRouterModel}
        modelOverrides={openRouterModelOverrides}
        onSaveModelOverride={saveOpenRouterModelOverride}
        genParams={onlineGenParams}
        onChangeGenParams={setOnlineGenParams}
        onRequestClose={() => setOpenRouterDialogVisible(false)}
        modelStatus={openRouterModelStatus}
        checking={checkingOpenRouterModels}
        lastCheckedAt={openRouterModelsCheckedAt}
        onCheckModels={checkOpenRouterModelsNow}
      />
      <OpenCodeModelsDialog
        visible={openCodeDialogVisible}
        config={openCodeDraft}
        onConfigChange={(partial) => setOpenCodeDraft((d) => ({ ...d, ...partial }))}
        onSave={(config) => {
          setOpenCode({
            baseUrl: config.baseUrl.trim(),
            modelId: config.modelId.trim(),
            apiKey: config.apiKey.trim(),
          });
          setMode("opencode");
          logInfo("Settings", "OpenCode settings saved");
        }}
        onClose={() => setOpenCodeDialogVisible(false)}
      />
      <CustomProviderDialog
        visible={custom1DialogVisible}
        config={custom1Draft}
        onConfigChange={(partial) => setCustom1Draft((d) => ({ ...d, ...partial }))}
        onSave={(config) => {
          setCustomProviderSlot(1, { ...config, name: config.name.trim() || "Custom #1", baseUrl: config.baseUrl.trim(), modelId: config.modelId.trim(), extraHeadersJson: config.extraHeadersJson.trim(), chatPath: (config.chatPath || "/chat/completions").trim(), apiKey: config.apiKey.trim() }, true);
          setCustom1DialogVisible(false);
          logInfo("Settings", t("customSavedLog", { slot: "1" }));
        }}
        onClose={() => setCustom1DialogVisible(false)}
      />
      <CustomProviderDialog
        visible={custom2DialogVisible}
        config={custom2Draft}
        onConfigChange={(partial) => setCustom2Draft((d) => ({ ...d, ...partial }))}
        onSave={(config) => {
          setCustomProviderSlot(2, { ...config, name: config.name.trim() || "Custom #2", baseUrl: config.baseUrl.trim(), modelId: config.modelId.trim(), extraHeadersJson: config.extraHeadersJson.trim(), chatPath: (config.chatPath || "/chat/completions").trim(), apiKey: config.apiKey.trim() }, true);
          setCustom2DialogVisible(false);
          logInfo("Settings", t("customSavedLog", { slot: "2" }));
        }}
        onClose={() => setCustom2DialogVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 12, paddingBottom: 32 },
  section: { color: "#94A3B8", fontSize: 13, fontWeight: "600", marginTop: 8, marginBottom: 4 },
  deviceCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 4 },
  deviceLine: { color: "#0F172A", fontSize: 12.5 },
  deviceNote: { color: "#64748B", fontSize: 12, marginTop: 4, lineHeight: 17 },
  modelCard: { borderRadius: 16, padding: 16, borderWidth: 1, gap: 8 },
  modelHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  settingsCardHeader: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 42 },
  modelInfo: { flex: 1 },
  modelName: { color: "#0F172A", fontSize: 15, fontWeight: "600" },
  modelMeta: { color: "#94A3B8", fontSize: 12, marginTop: 2 },
  modelDesc: { color: "#64748B", fontSize: 12, marginTop: 6, lineHeight: 17 },
  errorText: { color: "#F87171", fontSize: 12 },
  warnText: { color: "#F59E0B", fontSize: 11.5, marginTop: 2, lineHeight: 16 },
  hintText: { color: "#38BDF8", fontSize: 11.5, marginTop: 4, lineHeight: 16 },
  statusLine: { color: "#64748B", fontSize: 12, marginTop: 4 },
  modelActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  primaryButton: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryButtonText: { color: "#0B1220", fontSize: 13, fontWeight: "700" },
  transferBlock: { width: "100%", flexBasis: "100%", marginTop: 8, marginBottom: 4 },
  transferTitle: { fontSize: 12, fontWeight: "600", marginBottom: 8, letterSpacing: 0.2 },
  transferHint: { fontSize: 11, lineHeight: 15, marginTop: 4, marginBottom: 2, maxWidth: 340 },
  secondaryButton: { backgroundColor: "rgba(15, 118, 110, 0.12)", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "flex-start" },
  secondaryButtonText: { color: "#0F766E", fontSize: 13, fontWeight: "600" },
  divider: { height: 1, marginVertical: 6 },
  paramsHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  paramsTitle: { color: "#0F172A", fontSize: 13, fontWeight: "700" },
  autoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  autoLabel: { color: "#64748B", fontSize: 11.5 },
  autoResetText: { color: "#0D9488", fontSize: 11.5, fontWeight: "600" },
  apiKeyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  apiKeyInput: { color: "#F8FAFC", backgroundColor: "#1A2438",
    flex: 1, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: "#243044", fontSize: 13,
  },
  eyeBtn: { padding: 8 },
  eyeBtnText: { fontSize: 16 },
  deepSeekRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  deepSeekIcon: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  chevron: { fontSize: 28, fontWeight: "300", paddingHorizontal: 4 },
  expandContent: { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: "#243044", gap: 8 },
  urlLabel: { color: "#94A3B8", fontSize: 12 },
  urlValue: { color: "#64748B", fontSize: 12 },
  urlInput: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, fontSize: 13 },
  infoCard: { borderRadius: 16, padding: 16, borderWidth: 1 },
  infoText: { color: "#0F172A", fontSize: 16, fontWeight: "700" },
  infoSub: { color: "#94A3B8", fontSize: 13, marginTop: 4 },

  editModelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    alignSelf: "flex-start",
  },
  editModelBtnText: { color: "#0D9488", fontSize: 12, fontWeight: "700" },
  editModelPanel: { gap: 6, marginTop: 4 },
});
