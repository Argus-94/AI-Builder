import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Animated,
  Dimensions,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useTermuxContext } from "./TermuxContext";
import { isNativeModuleAvailable } from "../lib/termux-bridge";
import {
  COMPILE_PACKAGES,
  type CompilePkgId,
  type PackageRuntimeState,
  installCompilePackage,
  removeCompilePackage,
  verifyAllPackages,
  verifyPackageInstalled,
  loadInstalledMap,
} from "../lib/compile-packages";
import {
  REVERSE_PACKAGES,
  type ReversePkgId,
  installReversePackage,
  removeReversePackage,
  verifyAllReversePackages,
  verifyReversePackageInstalled,
  loadReverseInstalledMap,
} from "../lib/reverse-packages";
import {
  loadCustomTools,
  installCustomTool,
  removeCustomToolPkg,
  verifyCustomToolInstalled,
  deleteCustomTool,
  type CustomToolDef,
} from "../lib/custom-packages";
import { AddToolDialog } from "./AddToolDialog";
import { ProgressBar } from "./ProgressBar";
import { useDialog } from "./DialogContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { persistentLogger } from "../lib/persistent-logger";

const BUSY_INSTALL_KEY = "aibuilder.packages.busyInstall.v1";

async function persistBusyInstall(id: string | null) {
  try {
    if (!id) await AsyncStorage.removeItem(BUSY_INSTALL_KEY);
    else await AsyncStorage.setItem(BUSY_INSTALL_KEY, id);
  } catch {
    /* ignore */
  }
}

async function loadBusyInstall(): Promise<string | null> {
  try {
    return (await AsyncStorage.getItem(BUSY_INSTALL_KEY)) || null;
  } catch {
    return null;
  }
}


const MENU_WIDTH = Math.min(340, Dimensions.get("window").width * 0.88);

type SectionId = "compile" | "reverse" | "custom";
type AnyPkgId = CompilePkgId | ReversePkgId;

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function PackagesRightMenu({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { enabled: termuxEnabled } = useTermuxContext();
  const { showDialog } = useDialog();
  const termuxOk = isNativeModuleAvailable() && termuxEnabled;

  const slide = useRef(new Animated.Value(MENU_WIDTH)).current;
  const [states, setStates] = useState<Record<string, PackageRuntimeState>>({});
  const [scanningSection, setScanningSection] = useState<SectionId | null>(null);
  /** Both sections collapsed by default */
  const [expanded, setExpanded] = useState<Record<SectionId, boolean>>({
    compile: false,
    reverse: false,
    custom: true,
  });
  /** Track which sections already verified this open session */
  const verifiedRef = useRef<Record<SectionId, boolean>>({ compile: false, reverse: false, custom: false });
  const abortRef = useRef(false);
  const busyIdRef = useRef<AnyPkgId | null>(null);
  /** state-копия busyId — ref не триггерит re-render, кнопки иначе не disabled */
  const [busyId, setBusyId] = useState<AnyPkgId | null>(null);
  const [customTools, setCustomTools] = useState<CustomToolDef[]>([]);
  const [addToolOpen, setAddToolOpen] = useState(false);
  const [editTool, setEditTool] = useState<CustomToolDef | null>(null);

  const setOne = useCallback((id: string, patch: Partial<PackageRuntimeState>) => {
    setStates((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { status: "unknown", progress: 0 }), ...patch },
    }));
  }, []);

  useEffect(() => {
    if (visible) {
      abortRef.current = false;
      verifiedRef.current = { compile: false, reverse: false, custom: false };
      setExpanded({ compile: false, reverse: false, custom: true });
      void loadCustomTools().then(setCustomTools);
      Animated.timing(slide, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(slide, {
        toValue: MENU_WIDTH,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, slide]);

  const verifySection = useCallback(
    async (section: SectionId) => {
      if (!termuxOk) return;
      setScanningSection(section);
      try {
        if (section === "compile") {
          // Не показываем кэш как OK — только «checking», потом реальный Termux checkCmd.
          for (const def of COMPILE_PACKAGES) {
            setOne(def.id, {
              status: "checking",
              progress: 0,
              detail: "Проверка…",
              lastError: undefined,
            });
          }
          await verifyAllPackages((id, installed) => {
            setOne(id, {
              status: installed ? "installed" : "missing",
              progress: installed ? 100 : 0,
              detail: installed ? "Проверено в Termux" : "Не найдено",
              lastError: undefined,
            });
          });
        } else if (section === "reverse") {
          for (const def of REVERSE_PACKAGES) {
            const blocked = !!(def as { blocked?: boolean }).blocked;
            setOne(def.id, {
              status: blocked ? "blocked" : "checking",
              progress: 0,
              detail: blocked
                ? ((def as { blockedReason?: string }).blockedReason || "Автоустановка отключена")
                : "Проверка…",
              lastError: undefined,
            });
          }
          await verifyAllReversePackages((id, installed) => {
            const def = REVERSE_PACKAGES.find((p) => p.id === id);
            const blocked = !!(def as { blocked?: boolean } | undefined)?.blocked;
            if (blocked && !installed) {
              setOne(id, {
                status: "blocked",
                progress: 0,
                detail: (def as { blockedReason?: string } | undefined)?.blockedReason || "Автоустановка отключена",
                lastError: undefined,
              });
              return;
            }
            setOne(id, {
              status: installed ? "installed" : "missing",
              progress: installed ? 100 : 0,
              detail: installed ? "Проверено в Termux" : "Не найдено",
              lastError: undefined,
            });
          });
        } else if (section === "custom") {
          for (const def of customTools) {
            setOne(def.id, { status: "checking", progress: 0, detail: "Проверка…", lastError: undefined });
            const ok = await verifyCustomToolInstalled(def);
            setOne(def.id, {
              status: ok ? "installed" : "missing",
              progress: ok ? 100 : 0,
              detail: ok ? "Проверено в Termux" : "Не найдено",
              lastError: undefined,
            });
          }
        }
        verifiedRef.current[section] = true;
        persistentLogger.add("info", "PackagesMenu", `VERIFY_${section.toUpperCase()} complete`, "app");
      } catch (e: unknown) {
        persistentLogger.add(
          "error",
          "PackagesMenu",
          `VERIFY_${section} failed: ${e instanceof Error ? e.message : String(e)}`,
          "app"
        );
      } finally {
        setScanningSection(null);
      }
    },
    [termuxOk, setOne, customTools]
  );

  const toggleSection = useCallback(
    (section: SectionId) => {
      setExpanded((prev) => {
        const next = !prev[section];
        if (next && termuxOk && !verifiedRef.current[section]) {
          void verifySection(section);
        }
        return { ...prev, [section]: next };
      });
    },
    [termuxOk, verifySection]
  );

  useEffect(() => {
    if (!visible) {
      persistentLogger.add("debug", "PackagesMenu", "CLOSE", "app");
      return;
    }
    // After app reinstall / restart: never show OK from memory — re-verify Termux.
    // Resume interrupted install id (if any) as "checking" then real status.
    void (async () => {
      const interrupted = await loadBusyInstall();
      if (interrupted) {
        setOne(interrupted, {
          status: "checking",
          progress: 0,
          detail: "Проверка после перезапуска…",
          lastError: undefined,
        });
        void persistBusyInstall(null);
      }
      if (termuxOk) {
        for (const section of ["compile", "reverse", "custom"] as SectionId[]) {
          if (expanded[section] || section === "compile") {
            void verifySection(section);
          }
        }
      }
    })();
  }, [visible, termuxOk]);

  const runInstall = useCallback(
    async (id: AnyPkgId, kind: SectionId) => {
      if (busyIdRef.current) return;
      if (!termuxOk) {
        showDialog(
          "Termux",
          "Сначала включите Termux-сессию в настройках и дайте разрешение RUN_COMMAND."
        );
        return;
      }

      if (kind === "compile") {
        const def = COMPILE_PACKAGES.find((p) => p.id === id);
        if (!def) return;
        busyIdRef.current = id;
        setBusyId(id);
        abortRef.current = false;
        void persistBusyInstall(id);
        persistentLogger.add("info", "PackagesMenu", `INSTALL start id=${id}`, "app");
        setOne(id, { status: "installing", progress: 0, detail: "Старт…", lastError: undefined });
        const result = await installCompilePackage(
          def,
          (p, detail) => setOne(id, { status: "installing", progress: p, detail }),
          () => abortRef.current
        );
        // Always re-check in Termux — never trust only install exit / local cache.
        setOne(id, { status: "checking", progress: 0, detail: "Проверка после установки…" });
        let reallyThere = false;
        try {
          reallyThere = await verifyPackageInstalled(def);
        } catch {
          reallyThere = false;
        }
        void persistBusyInstall(null);
        if (result.ok && reallyThere) {
          setOne(id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
        } else if (result.error === "aborted") {
          setOne(id, {
            status: reallyThere ? "installed" : "missing",
            progress: reallyThere ? 100 : 0,
            detail: reallyThere ? "Отменено (частично установлено)" : "Отменено",
          });
        } else if (reallyThere) {
          setOne(id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
        } else {
          setOne(id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error || "verify failed" });
          showDialog(def.name, `Не удалось установить:\n${result.error || "пакет не найден после установки"}`);
        }
      } else {
        const def = REVERSE_PACKAGES.find((p) => p.id === id);
        if (!def) return;
        if (def.blocked) {
          setOne(id, {
            status: "blocked",
            progress: 0,
            detail: def.blockedReason || "Автоустановка отключена",
            lastError: def.blockedReason,
          });
          showDialog(def.name, def.blockedReason || "Автоустановка отключена (нет integrity pin).");
          return;
        }
        busyIdRef.current = id;
        setBusyId(id);
        abortRef.current = false;
        void persistBusyInstall(id);
        persistentLogger.add("info", "PackagesMenu", `INSTALL reverse id=${id}`, "app");
        setOne(id, { status: "installing", progress: 0, detail: "Старт…", lastError: undefined });
        const result = await installReversePackage(
          def,
          (p, detail) => setOne(id, { status: "installing", progress: p, detail }),
          () => abortRef.current
        );
        setOne(id, { status: "checking", progress: 0, detail: "Проверка после установки…" });
        let reallyThere = false;
        try {
          reallyThere = await verifyReversePackageInstalled(def);
        } catch {
          reallyThere = false;
        }
        void persistBusyInstall(null);
        if (result.ok && reallyThere) {
          setOne(id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
        } else if (result.error === "aborted") {
          setOne(id, {
            status: reallyThere ? "installed" : "missing",
            progress: reallyThere ? 100 : 0,
            detail: reallyThere ? "Отменено (частично установлено)" : "Отменено",
          });
        } else if (reallyThere) {
          setOne(id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
        } else {
          setOne(id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error || "verify failed" });
          showDialog(def.name, `Не удалось установить:\n${result.error || "пакет не найден после установки"}`);
        }
      }
      busyIdRef.current = null;
      setBusyId(null);
    },
    [termuxOk, setOne, showDialog]
  );

  const runRemove = useCallback(
    async (id: AnyPkgId, kind: SectionId) => {
      if (busyIdRef.current) return;
      if (!termuxOk) {
        showDialog("Termux", "Сначала включите Termux-сессию.");
        return;
      }

      if (kind === "compile") {
        const def = COMPILE_PACKAGES.find((p) => p.id === id);
        if (!def) return;
        busyIdRef.current = id;
        setBusyId(id);
        abortRef.current = false;
        setOne(id, { status: "removing", progress: 0, detail: "Удаление…", lastError: undefined });
        const result = await removeCompilePackage(
          def,
          (p, detail) => setOne(id, { status: "removing", progress: p, detail }),
          () => abortRef.current
        );
        if (result.ok) {
          setOne(id, { status: "missing", progress: 0, detail: "Удалено" });
        } else if (result.error === "aborted") {
          setOne(id, { status: "checking", progress: 0, detail: "Проверка после отмены…" });
        } else {
          setOne(id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error });
          showDialog(def.name, `Не удалось удалить:\n${result.error || "unknown"}`);
        }
      } else {
        const def = REVERSE_PACKAGES.find((p) => p.id === id);
        if (!def) return;
        busyIdRef.current = id;
        setBusyId(id);
        abortRef.current = false;
        setOne(id, { status: "removing", progress: 0, detail: "Удаление…", lastError: undefined });
        const result = await removeReversePackage(
          def,
          (p, detail) => setOne(id, { status: "removing", progress: p, detail }),
          () => abortRef.current
        );
        if (result.ok) {
          setOne(id, { status: "missing", progress: 0, detail: "Удалено" });
        } else if (result.error === "aborted") {
          setOne(id, { status: "checking", progress: 0, detail: "Проверка после отмены…" });
        } else {
          setOne(id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error });
          showDialog(def.name, `Не удалось удалить:\n${result.error || "unknown"}`);
        }
      }
      busyIdRef.current = null;
      setBusyId(null);
    },
    [termuxOk, setOne, showDialog]
  );

  const cancelBusy = useCallback(() => {
    abortRef.current = true;
    persistentLogger.add("warn", "PackagesMenu", `CANCEL requested id=${busyIdRef.current || "none"}`, "app");
  }, []);

  const refreshCustom = useCallback(async () => {
    setCustomTools(await loadCustomTools());
  }, []);

  const handleInstallCustom = useCallback(
    async (def: CustomToolDef) => {
      if (!termuxOk || busyIdRef.current) return;
      abortRef.current = false;
      busyIdRef.current = def.id as AnyPkgId;
      setBusyId(def.id as AnyPkgId);
      void persistBusyInstall(def.id);
      setOne(def.id, { status: "installing", progress: 2, detail: "Старт…", lastError: undefined });
      const result = await installCustomTool(
        def,
        (p, detail) => setOne(def.id, { status: "installing", progress: p, detail }),
        () => abortRef.current
      );
      setOne(def.id, { status: "checking", progress: 0, detail: "Проверка после установки…" });
      let reallyThere = false;
      try {
        reallyThere = await verifyCustomToolInstalled(def);
      } catch {
        reallyThere = false;
      }
      void persistBusyInstall(null);
      if (result.ok && reallyThere) {
        setOne(def.id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
      } else if (result.error === "aborted") {
        setOne(def.id, {
          status: reallyThere ? "installed" : "missing",
          progress: reallyThere ? 100 : 0,
          detail: reallyThere ? "Отменено (частично установлено)" : "Отменено",
        });
      } else if (reallyThere) {
        setOne(def.id, { status: "installed", progress: 100, detail: "Проверено в Termux" });
      } else {
        setOne(def.id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error || "verify failed" });
        showDialog(def.name, `Не удалось установить:\n${result.error || "пакет не найден после установки"}`);
      }
      busyIdRef.current = null;
      setBusyId(null);
    },
    [termuxOk, setOne, showDialog]
  );

  const handleRemoveCustom = useCallback(
    async (def: CustomToolDef) => {
      if (!termuxOk || busyIdRef.current) return;
      abortRef.current = false;
      busyIdRef.current = def.id as AnyPkgId;
      setBusyId(def.id as AnyPkgId);
      setOne(def.id, { status: "removing", progress: 5, detail: "Удаление…" });
      const result = await removeCustomToolPkg(
        def,
        (p, detail) => setOne(def.id, { status: "removing", progress: p, detail }),
        () => abortRef.current
      );
      if (result.ok) {
        setOne(def.id, { status: "missing", progress: 0, detail: "Удалено" });
      } else if (result.error === "aborted") {
        setOne(def.id, { status: "checking", progress: 0, detail: "Проверка после отмены…" });
      } else {
        setOne(def.id, { status: "error", progress: 0, detail: "Ошибка", lastError: result.error });
        showDialog(def.name, `Не удалось удалить:\n${result.error || "unknown"}`);
      }
      busyIdRef.current = null;
      setBusyId(null);
    },
    [termuxOk, setOne, showDialog]
  );

  const handleDeleteCustomDef = useCallback(
    async (def: CustomToolDef) => {
      showDialog(
        language === "en" ? "Remove from list?" : language === "uk" ? "Прибрати зі списку?" : "Убрать из списка?",
        language === "en"
          ? `Delete “${def.name}” definition? (Does not uninstall from Termux.)`
          : language === "uk"
            ? `Видалити «${def.name}» зі списку? (З Termux не знімає.)`
            : `Удалить «${def.name}» из списка? (Из Termux не снимает.)`,
        [
          { text: language === "en" ? "Cancel" : "Отмена", style: "cancel" },
          {
            text: language === "en" ? "Delete" : "Удалить",
            style: "destructive",
            onPress: () => {
              void (async () => {
                await deleteCustomTool(def.id);
                await refreshCustom();
                setStates((prev) => {
                  const n = { ...prev };
                  delete n[def.id];
                  return n;
                });
              })();
            },
          },
        ]
      );
    },
    [showDialog, language, refreshCustom]
  );



  const title =
    language === "en" ? "Packages for install" : language === "uk" ? "Пакети для встановлення" : "Пакеты для установки";

  const sectionCompile =
    language === "en" ? "For compilation" : language === "uk" ? "Для компіляції" : "Для компиляции";
  const sectionReverse =
    language === "en" ? "Reverse engineering" : language === "uk" ? "Реверс-інжиніринг" : "Реверсинженеринг";
  const sectionCustom =
    language === "en" ? "User tools" : language === "uk" ? "Користувацькі" : "Пользовательские";
  const addToolsTitle =
    language === "en" ? "Add tools" : language === "uk" ? "Додавання інструментів" : "Добавление инструментов";
  const addToolsHint =
    language === "en"
      ? "Create a custom installable tool for compilation or reverse sections"
      : language === "uk"
        ? "Створіть свій інструмент для розділів компіляції або реверсу"
        : "Создайте свой инструмент для разделов компиляции или реверса";

  const renderPkgCard = (
    def: { id: string; name: string; nameEn: string; blocked?: boolean; blockedReason?: string },
    kind: SectionId
  ) => {
    const st = states[def.id] || { status: "unknown" as const, progress: 0 };
    const isBusy = st.status === "installing" || st.status === "removing";
    const isInstalled = st.status === "installed";
    const isError = st.status === "error";
    const isBlocked = st.status === "blocked" || !!def.blocked;
    const isChecking = st.status === "checking";
    const name = language === "en" ? def.nameEn : def.name;

    const badgeBg = isInstalled
      ? "rgba(34,197,94,0.18)"
      : isBusy || isChecking
        ? "rgba(251,191,36,0.18)"
        : isError
          ? colors.dangerDim
          : isBlocked
            ? "rgba(148,163,184,0.22)"
            : "rgba(148,163,184,0.15)";
    const badgeLabel = isBusy
      ? `${Math.round(st.progress)}%`
      : isChecking
        ? "…"
        : isInstalled
          ? "OK"
          : isError
            ? "ERR"
            : isBlocked
              ? "OFF"
              : "—";
    const badgeColor = isBusy || isChecking
      ? colors.warning
      : isInstalled
        ? colors.success
        : isError
          ? colors.danger
          : colors.muted;

    return (
      <View
        key={def.id}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: isError ? colors.danger : colors.line,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.pkgName, { color: colors.inkBright }]} numberOfLines={2}>
              {name}
            </Text>
            <Text style={[styles.pkgId, { color: colors.muted }]}>{def.id}</Text>
            {!!st.detail && !isBusy && (
              <Text style={[styles.pkgId, { color: colors.muted, marginTop: 2 }]} numberOfLines={2}>
                {st.detail}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={{ color: badgeColor, fontWeight: "800", fontSize: 11 }}>{badgeLabel}</Text>
          </View>
        </View>

        {isBusy && (
          <View style={{ marginTop: 8 }}>
            <ProgressBar progress={st.progress} sublabel={st.detail} />
          </View>
        )}

        {isError && !!st.lastError && (
          <Text style={[styles.errText, { color: colors.danger }]} numberOfLines={3}>
            {st.lastError}
          </Text>
        )}

        <View style={styles.actions}>
          {isBusy ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.dangerDim, borderColor: colors.danger }]}
              onPress={cancelBusy}
              activeOpacity={0.75}
            >
              <Ionicons name="close-circle-outline" size={18} color={colors.danger} />
              <Text style={[styles.btnText, { color: colors.danger }]}>Отмена</Text>
            </TouchableOpacity>
          ) : isBlocked && !isInstalled ? (
            <View
              style={[
                styles.btn,
                {
                  backgroundColor: "rgba(148,163,184,0.12)",
                  borderColor: colors.line,
                  flex: 1,
                  opacity: 0.85,
                },
              ]}
            >
              <Ionicons name="lock-closed-outline" size={18} color={colors.muted} />
              <Text style={[styles.btnText, { color: colors.muted }]}>Недоступно</Text>
            </View>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.btn,
                  {
                    backgroundColor: isInstalled ? colors.accentDim : colors.accent,
                    borderColor: colors.accent,
                    flex: 1,
                  },
                ]}
                onPress={() => void runInstall(def.id as AnyPkgId, kind)}
                activeOpacity={0.75}
                disabled={!!busyId || isChecking}
              >
                <Ionicons
                  name={isInstalled ? "refresh-outline" : "download-outline"}
                  size={18}
                  color={isInstalled ? colors.accent : colors.background}
                />
                <Text
                  style={[
                    styles.btnText,
                    { color: isInstalled ? colors.accent : colors.background },
                  ]}
                >
                  {isInstalled ? "Переуст." : "Установить"}
                </Text>
              </TouchableOpacity>

              {isInstalled && (
                <TouchableOpacity
                  style={[
                    styles.btnIcon,
                    { backgroundColor: colors.dangerDim, borderColor: colors.danger },
                  ]}
                  onPress={() => void runRemove(def.id as AnyPkgId, kind)}
                  activeOpacity={0.75}
                  disabled={!!busyId}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      </View>
    );
  };


  const renderCustomCard = (def: CustomToolDef) => {
    const st = states[def.id] || { status: "unknown" as const, progress: 0 };
    const isBusy = st.status === "installing" || st.status === "removing";
    const isInstalled = st.status === "installed";
    const isError = st.status === "error";
    const isChecking = st.status === "checking";
    const name = language === "en" ? def.nameEn || def.name : def.name;
    const sectionLabel =
      def.section === "compile"
        ? language === "en"
          ? "Compilation"
          : language === "uk"
            ? "Компіляція"
            : "Компиляция"
        : language === "en"
          ? "Reverse"
          : language === "uk"
            ? "Реверс"
            : "Реверс";

    const badgeBg = isInstalled
      ? "rgba(34,197,94,0.18)"
      : isBusy || isChecking
        ? "rgba(251,191,36,0.18)"
        : isError
          ? colors.dangerDim
          : "rgba(148,163,184,0.15)";
    const badgeLabel = isBusy
      ? `${Math.round(st.progress)}%`
      : isChecking
        ? "…"
        : isInstalled
          ? "OK"
          : isError
            ? "ERR"
            : "—";
    const badgeColor =
      isBusy || isChecking ? colors.warning : isInstalled ? colors.success : isError ? colors.danger : colors.muted;

    return (
      <View
        key={def.id}
        style={[
          styles.card,
          {
            backgroundColor: colors.surface,
            borderColor: isError ? colors.danger : colors.line,
          },
        ]}
      >
        <View style={styles.cardTop}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Ionicons
                name={(def.icon as any) || "extension-puzzle-outline"}
                size={18}
                color={colors.accent}
              />
              <Text style={[styles.pkgName, { color: colors.inkBright, flex: 1 }]} numberOfLines={2}>
                {name}
              </Text>
            </View>
            <Text style={[styles.pkgId, { color: colors.muted }]}>
              {def.id} · {sectionLabel} · {def.installKind}
            </Text>
            {!!def.description && (
              <Text style={[styles.pkgId, { color: colors.muted, marginTop: 2 }]} numberOfLines={2}>
                {def.description}
              </Text>
            )}
            {!!st.detail && !isBusy && (
              <Text style={[styles.pkgId, { color: colors.muted, marginTop: 2 }]} numberOfLines={2}>
                {st.detail}
              </Text>
            )}
          </View>
          <View style={[styles.badge, { backgroundColor: badgeBg }]}>
            <Text style={{ color: badgeColor, fontWeight: "800", fontSize: 11 }}>{badgeLabel}</Text>
          </View>
        </View>

        {isBusy && (
          <View style={{ marginTop: 8 }}>
            <ProgressBar progress={st.progress} sublabel={st.detail} />
          </View>
        )}

        {isError && !!st.lastError && (
          <Text style={[styles.errText, { color: colors.danger }]} numberOfLines={4}>
            {st.lastError}
          </Text>
        )}

        <View style={styles.cardActions}>
          {isBusy ? (
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.dangerDim, borderColor: colors.danger, flex: 1 }]}
              onPress={cancelBusy}
              activeOpacity={0.75}
            >
              <Ionicons name="stop-outline" size={18} color={colors.danger} />
              <Text style={[styles.btnText, { color: colors.danger }]}>
                {language === "en" ? "Cancel" : "Отмена"}
              </Text>
            </TouchableOpacity>
          ) : (
            <>
              <TouchableOpacity
                style={[
                  styles.btn,
                  {
                    backgroundColor: isInstalled ? colors.accentDim : colors.accent,
                    borderColor: colors.accent,
                    flex: 1,
                  },
                ]}
                onPress={() => void handleInstallCustom(def)}
                activeOpacity={0.75}
                disabled={!!busyId || isChecking || !termuxOk}
              >
                <Ionicons
                  name={isInstalled ? "refresh-outline" : "download-outline"}
                  size={18}
                  color={isInstalled ? colors.accent : colors.background}
                />
                <Text
                  style={[
                    styles.btnText,
                    { color: isInstalled ? colors.accent : colors.background },
                  ]}
                >
                  {isInstalled
                    ? language === "en"
                      ? "Reinstall"
                      : "Переуст."
                    : language === "en"
                      ? "Install"
                      : "Установить"}
                </Text>
              </TouchableOpacity>

              {isInstalled && (
                <TouchableOpacity
                  style={[
                    styles.btnIcon,
                    { backgroundColor: colors.dangerDim, borderColor: colors.danger },
                  ]}
                  onPress={() => void handleRemoveCustom(def)}
                  activeOpacity={0.75}
                  disabled={!!busyId}
                >
                  <Ionicons name="trash-outline" size={18} color={colors.danger} />
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[
                  styles.btnIcon,
                  { backgroundColor: colors.accentDim, borderColor: colors.accent },
                ]}
                onPress={() => {
                  setEditTool(def);
                  setAddToolOpen(true);
                }}
                activeOpacity={0.75}
                disabled={!!busyId}
              >
                <Ionicons name="create-outline" size={18} color={colors.accent} />
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.btnIcon,
                  { backgroundColor: "rgba(148,163,184,0.15)", borderColor: colors.line },
                ]}
                onPress={() => void handleDeleteCustomDef(def)}
                activeOpacity={0.75}
                disabled={!!busyId}
              >
                <Ionicons name="close-outline" size={18} color={colors.muted} />
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  };

  const renderSectionHeader = (
    section: SectionId,
    label: string,
    icon: keyof typeof Ionicons.glyphMap,
    count: number
  ) => {
    const isOpen = expanded[section];
    const isScanning = scanningSection === section;
    return (
      <TouchableOpacity
        style={[
          styles.sectionHeader,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
          },
        ]}
        onPress={() => toggleSection(section)}
        activeOpacity={0.75}
      >
        <View style={styles.sectionHeaderLeft}>
          <View style={[styles.sectionIconWrap, { backgroundColor: colors.accentDim }]}>
            <Ionicons name={icon} size={18} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.sectionTitle, { color: colors.inkBright }]}>{label}</Text>
            <Text style={[styles.sectionMeta, { color: colors.muted }]}>
              {count} {language === "en" ? "tools" : language === "uk" ? "інструментів" : "инструментов"}
            </Text>
          </View>
        </View>
        {isScanning ? (
          <ActivityIndicator size="small" color={colors.accent} />
        ) : (
          <Ionicons
            name={isOpen ? "chevron-up" : "chevron-down"}
            size={20}
            color={colors.muted}
          />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlayRoot}>
        <Pressable style={[styles.backdrop, { backgroundColor: colors.overlay }]} onPress={onClose} />
        <Animated.View
          style={[
            styles.panel,
            {
              width: MENU_WIDTH,
              backgroundColor: colors.drawerBg,
              paddingTop: Math.max(insets.top, 12),
              paddingBottom: Math.max(insets.bottom, 12),
              transform: [{ translateX: slide }],
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.line }]}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.title, { color: colors.inkBright }]}>{title}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={12} style={styles.closeBtn}>
              <Ionicons name="close" size={22} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {!termuxOk && (
            <View style={[styles.warnBanner, { backgroundColor: colors.dangerDim }]}>
              <Ionicons name="warning-outline" size={18} color={colors.danger} />
              <Text style={[styles.warnText, { color: colors.danger }]}>
                Termux не готов. Включите сессию в настройках Termux.
              </Text>
            </View>
          )}

          <ScrollView
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Add custom tools */}
            <TouchableOpacity
              style={[
                styles.addToolsBtn,
                { backgroundColor: colors.accentDim, borderColor: colors.accent },
              ]}
              onPress={() => {
                setEditTool(null);
                setAddToolOpen(true);
              }}
              activeOpacity={0.75}
            >
              <View style={[styles.addToolsIcon, { backgroundColor: colors.surface }]}>
                <Ionicons name="add-circle-outline" size={22} color={colors.accent} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.addToolsTitle, { color: colors.inkBright }]}>{addToolsTitle}</Text>
                <Text style={[styles.addToolsHint, { color: colors.muted }]}>{addToolsHint}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.accent} />
            </TouchableOpacity>

            {/* Section: For compilation */}
            {renderSectionHeader(
              "compile",
              sectionCompile,
              "construct-outline",
              COMPILE_PACKAGES.length
            )}
            {expanded.compile && (
              <View style={styles.sectionBody}>
                {scanningSection === "compile" ? (
                  <View style={styles.scanRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.scanText, { color: colors.muted }]}>Реальная проверка в Termux…</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.scanRow}
                    onPress={() => {
                      verifiedRef.current.compile = false;
                      void verifySection("compile");
                    }}
                    disabled={!!busyId}
                  >
                    <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                    <Text style={[styles.scanText, { color: colors.accent }]}>Перепроверить в Termux</Text>
                  </TouchableOpacity>
                )}
                {COMPILE_PACKAGES.map((def) => renderPkgCard(def, "compile"))}
              </View>
            )}

            {/* Section: Reverse engineering */}
            {renderSectionHeader("reverse", sectionReverse, "code-slash-outline", REVERSE_PACKAGES.length)}
            {expanded.reverse && (
              <View style={styles.sectionBody}>
                {scanningSection === "reverse" ? (
                  <View style={styles.scanRow}>
                    <ActivityIndicator size="small" color={colors.accent} />
                    <Text style={[styles.scanText, { color: colors.muted }]}>Реальная проверка в Termux…</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.scanRow}
                    onPress={() => {
                      verifiedRef.current.reverse = false;
                      void verifySection("reverse");
                    }}
                    disabled={!!busyId}
                  >
                    <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                    <Text style={[styles.scanText, { color: colors.accent }]}>Перепроверить в Termux</Text>
                  </TouchableOpacity>
                )}
                {REVERSE_PACKAGES.map((def) => renderPkgCard(def, "reverse"))}
              </View>
            )}

            {/* Section: User / custom tools */}
            {renderSectionHeader("custom", sectionCustom, "person-outline", customTools.length)}
            {expanded.custom && (
              <View style={styles.sectionBody}>
                {customTools.length === 0 ? (
                  <Text style={[styles.scanText, { color: colors.muted, paddingVertical: 8 }]}>
                    {language === "en"
                      ? "No user tools yet. Tap “Add tools” above."
                      : language === "uk"
                        ? "Поки немає користувацьких інструментів. Натисніть «Додавання інструментів»."
                        : "Пока нет пользовательских инструментов. Нажмите «Добавление инструментов»."}
                  </Text>
                ) : (
                  <>
                    {scanningSection === "custom" ? (
                      <View style={styles.scanRow}>
                        <ActivityIndicator size="small" color={colors.accent} />
                        <Text style={[styles.scanText, { color: colors.muted }]}>Реальная проверка в Termux…</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={styles.scanRow}
                        onPress={() => {
                          verifiedRef.current.custom = false;
                          void verifySection("custom");
                        }}
                        disabled={!!busyId}
                      >
                        <Ionicons name="refresh-outline" size={16} color={colors.accent} />
                        <Text style={[styles.scanText, { color: colors.accent }]}>Перепроверить в Termux</Text>
                      </TouchableOpacity>
                    )}
                    {[...customTools]
                      .sort((a, b) => a.order - b.order)
                      .map((def) => renderCustomCard(def))}
                  </>
                )}
              </View>
            )}

            <View style={{ height: 24 }} />
          </ScrollView>
        </Animated.View>
      </View>
      <AddToolDialog
        visible={addToolOpen}
        initial={editTool}
        onClose={() => {
          setAddToolOpen(false);
          setEditTool(null);
        }}
        onSaved={(tool) => {
          void refreshCustom();
          setOne(tool.id, { status: "missing", progress: 0, detail: "Добавлено" });
          setExpanded((e) => ({ ...e, custom: true }));
          setEditTool(null);
          setAddToolOpen(false);
        }}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayRoot: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  panel: {
    height: "100%",
    elevation: 16,
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: -4, height: 0 },
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: {
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  closeBtn: {
    padding: 4,
    marginLeft: 8,
  },
  warnBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 12,
    marginTop: 10,
    padding: 10,
    borderRadius: 10,
  },
  warnText: {
    flex: 1,
    fontSize: 12,
    fontWeight: "600",
  },
  scanRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  scanText: {
    fontSize: 12,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 10,
  },
  addToolsBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    marginBottom: 4,
  },
  addToolsIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  addToolsTitle: {
    fontSize: 14,
    fontWeight: "800",
  },
  addToolsHint: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 2,
  },
  pkgIcon: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  pkgMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  pkgDesc: {
    fontSize: 11,
    lineHeight: 15,
    marginTop: 6,
  },
  pkgDetail: {
    fontSize: 11,
    marginTop: 4,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  cardActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 9,
    borderWidth: 1,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  sectionHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
  },
  sectionIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "800",
  },
  sectionMeta: {
    fontSize: 11,
    marginTop: 1,
  },
  sectionBody: {
    gap: 10,
    marginTop: 2,
    marginBottom: 6,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pkgName: {
    fontSize: 14,
    fontWeight: "700",
  },
  pkgId: {
    fontSize: 11,
    marginTop: 2,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    minWidth: 40,
    alignItems: "center",
  },
  errText: {
    fontSize: 11,
    marginTop: 6,
  },
  actions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  btnIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 13,
    fontWeight: "700",
  },
});
