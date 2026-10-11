import "../lib/runtime-polyfills";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Drawer } from "expo-router/drawer";
import { DrawerActions } from "@react-navigation/native";
import { useNavigation, useRouter, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, TouchableOpacity, DeviceEventEmitter, AppState , View, Text} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { DrawerContent } from "../components/DrawerContent";
import { usePermissions } from "../hooks/usePermissions";
import { LoggerProvider } from "../components/LoggerContext";
import { LLMProvider } from "../components/LLMContext";
import { DialogProvider } from "../components/DialogContext";
import { AppSettingsProvider } from "../components/AppSettingsContext";
import { TermuxProvider, useTermuxContext } from "../components/TermuxContext";
import { TermuxConsoleProvider, useTermuxConsole } from "../components/TermuxConsoleContext";
import { RuntimeStatusOverlay } from "../components/RuntimeStatusOverlay";
import { LanguageProvider, useLanguage } from "../components/LanguageContext";
import { useDialog } from "../components/DialogContext";
import { ThemeProvider, useTheme } from "../components/ThemeContext";
import { ProjectProvider } from "../components/ProjectContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PackagesMenuProvider, usePackagesMenu } from "../components/PackagesMenuContext";
import { PackagesRightMenu } from "../components/PackagesRightMenu";
import { installGlobalErrorHandlers } from "../lib/crash-handlers";
import { initAppNotifications } from "../lib/app-notifications";
import { useEffect, useMemo, useRef, useState } from "react";
import { getRuntimeFacade } from "../lib/runtime-facade";
import { FIRST_RUN_PROMPT_VERSION, firstRunPromptDeferralStore } from "../lib/first-run-prompt";
import { getInterceptorIndicatorState, isInterceptorListenerLive } from "../lib/chat-indicator-layout";
import { openRunCommandPermissionSettings } from "../lib/termux-bridge";
import { persistentLogger } from "../lib/persistent-logger";

installGlobalErrorHandlers();
// Register durable HOME-backed state before settings/project providers hydrate.
try { getRuntimeFacade(); } catch { /* runtime remains lazy if the platform adapter is unavailable */ }

function AppLayout() {
  usePermissions();
  useEffect(() => {
    void initAppNotifications();
  }, []);
  useEffect(() => {
    const facade = getRuntimeFacade();
    const mapState = (state: string) => state === "active" ? "active" as const : state === "inactive" ? "inactive" as const : "background" as const;
    facade.setAppLifecycleState(mapState(AppState.currentState));
    facade.interceptorEngine.setAppState(AppState.currentState === "active" ? "active" : "background");
    const appState = AppState.addEventListener("change", (state) => { const mapped = mapState(state); facade.setAppLifecycleState(mapped); facade.interceptorEngine.setAppState(state === "active" ? "active" : "background"); });
    const memoryWarning = DeviceEventEmitter.addListener("memoryWarning", () => {
      void facade.notifyOfflineMemoryPressure().catch(() => undefined);
      facade.interceptorEngine.notifyMemoryWarning();
    });
    const androidMemoryPressure = DeviceEventEmitter.addListener("AibMemoryPressure", () => {
      void facade.notifyOfflineMemoryPressure().catch(() => undefined);
      facade.interceptorEngine.notifyMemoryWarning();
    });
    void facade.primeMemoryPressureMonitoring().catch(() => false);
    return () => { appState.remove(); memoryWarning.remove(); androidMemoryPressure.remove(); };
  }, []);
  useEffect(() => {
    try {
      const facade = getRuntimeFacade();
      facade.startupTrace.begin();
      facade.recordStartupStage("app-init", "ok", "AppLayout mounted");
      facade.recordStartupStage("permissions", "started");
      void facade.recoverPendingTransactions().then((r) => {
        facade.recordStartupStage(
          "journal-recovery",
          r.failed > 0 ? "warn" : "ok",
          `recovered=${r.recovered} failed=${r.failed}`,
        );
      }).catch(() => {
        facade.recordStartupStage("journal-recovery", "warn", "recovery skipped");
      });
      facade.startupTrace.markReady();
    } catch {
      /* runtime optional at first paint */
    }
  }, []);
  const { t, language } = useLanguage();
  const { showDialog } = useDialog();
  const router = useRouter();
  const segments = useSegments();
  useEffect(() => {
    const screen = segments
      .filter((segment) => /^[A-Za-z0-9_\[\].-]{1,48}$/.test(segment))
      .slice(0, 4)
      .join(".") || "root";
    persistentLogger.markAppEvent("SCREEN_VIEW", { screen });
  }, [segments]);
  const firstRunPrompted = useRef(false);
  useEffect(() => {
    if (firstRunPrompted.current) return;
    firstRunPrompted.current = true;
    let mounted = true;
    void firstRunPromptDeferralStore.isDeferred(FIRST_RUN_PROMPT_VERSION).catch(() => false).then((deferred) => {
      if (!mounted || deferred) return undefined;
      return getRuntimeFacade().firstRunStatus();
    }).then((status) => {
      if (!mounted || !status || !status.required) return;
      const title = status.error?.code === "STATE_CORRUPT"
        ? { ru: "Безопасное восстановление состояния", uk: "Безпечне відновлення стану", en: "Safe state recovery" }[language]
        : status.error
          ? { ru: "Проверка сохранённого состояния", uk: "Перевірка збереженого стану", en: "Saved-state check" }[language]
          : { ru: "Настройка первого запуска", uk: "Налаштування першого запуску", en: "First-run setup" }[language];
      const body = status.error?.code === "LEGACY_STATE_UNAVAILABLE"
        ? { ru: "Старая запись настройки ещё не проверена: Android не подтвердил RUN_COMMAND. Это не означает, что запись отсутствует; повторная настройка не запускалась и данные не менялись. Для перенесённой записи: Настройки Android → Приложения → AI Builder → Разрешения → Дополнительные разрешения → RUN_COMMAND, затем повторите проверку.", uk: "Старий запис налаштування ще не перевірено: Android не підтвердив RUN_COMMAND. Це не означає, що запис відсутній; повторне налаштування не запускалося й дані не змінювалися. Для перенесеного запису: Налаштування Android → Застосунки → AI Builder → Дозволи → Додаткові дозволи → RUN_COMMAND, потім перевірте ще раз.", en: "The legacy setup marker could not be checked because Android has not confirmed RUN_COMMAND. This does not mean the marker is missing; setup was not rerun and data was not changed. For a migrated install: Android Settings → Apps → AI Builder → Permissions → Additional permissions → RUN_COMMAND, then retry the check." }[language]
        : status.error?.code === "STATE_FUTURE_VERSION"
          ? { ru: "Запись создана более новой версией приложения. Она оставлена без изменений; обновите приложение, не запускайте восстановление старой версии.", uk: "Запис створено новішою версією застосунку. Його залишено без змін; оновіть застосунок і не запускайте відновлення старою версією.", en: "The marker was written by a newer app version and was left unchanged. Update the app; do not recover it with this older version." }[language]
          : status.error?.code === "STATE_CORRUPT"
            ? { ru: "Запись настройки повреждена. Безопасное восстановление сначала сохранит исходные байты отдельно; завершённые этапы bootstrap не будут сброшены.", uk: "Запис налаштування пошкоджено. Безпечне відновлення спочатку збереже оригінальні байти окремо; завершені етапи bootstrap не буде скинуто.", en: "The setup marker is malformed. Safe recovery first preserves the original bytes separately; completed bootstrap stages are not reset." }[language]
            : status.error
              ? { ru: "Не удалось прочитать app-private состояние первого запуска. Настройка не запускалась; проверьте хранилище приложения и повторите проверку.", uk: "Не вдалося прочитати app-private стан першого запуску. Налаштування не запускалося; перевірте сховище застосунку й повторіть перевірку.", en: "The app-private first-run state could not be read. Setup was not started; check app storage and retry the status check." }[language]
        : status.kind === "repair"
          ? { ru: "Состояние первого запуска повреждено. Можно открыть диагностику и безопасное восстановление.", uk: "Стан першого запуску пошкоджено. Можна відкрити діагностику та безпечне відновлення.", en: "First-run state is invalid. Open diagnostics and safe repair." }[language]
          : status.kind === "major-update"
            ? { ru: "Доступна проверка после крупного обновления.", uk: "Доступна перевірка після великого оновлення.", en: "A post-update readiness check is available." }[language]
            : status.kind === "resume"
                ? { ru: "Настройка первого запуска не завершена и может быть продолжена.", uk: "Налаштування першого запуску не завершене й може бути продовжене.", en: "First-run setup is incomplete and can be resumed." }[language]
                : { ru: "Запустите диагностику и настройку среды.", uk: "Запустіть діагностику та налаштування середовища.", en: "Run diagnostics and configure the runtime environment." }[language];
      const deferNote = { ru: "«Позже» сохранит выбор для этой версии приложения; настройку можно открыть вручную в разделе Runtime.", uk: "«Пізніше» збереже вибір для цієї версії застосунку; налаштування можна відкрити вручну в розділі Runtime.", en: "Later is remembered for this app version; you can reopen setup manually from Runtime." }[language];
      const startAction = status.error && status.error.code !== "STATE_CORRUPT"
        ? { text: { ru: "Открыть диагностику", uk: "Відкрити діагностику", en: "Open diagnostics" }[language], onPress: () => { void firstRunPromptDeferralStore.clear().catch(() => undefined).then(() => router.push("/runtime")); } }
        : { text: status.error?.code === "STATE_CORRUPT" ? { ru: "Безопасное восстановление", uk: "Безпечне відновлення", en: "Safe recovery" }[language] : { ru: "Запустить настройку", uk: "Запустити налаштування", en: "Start setup" }[language], onPress: () => { void firstRunPromptDeferralStore.clear().catch(() => undefined).then(() => router.push({ pathname: "/runtime", params: { firstRunSetup: "1" } })); } };
      showDialog(title, `${body}\n\n${deferNote}`, [
        { text: { ru: "Позже", uk: "Пізніше", en: "Later" }[language], style: "cancel", onPress: () => { void firstRunPromptDeferralStore.defer(FIRST_RUN_PROMPT_VERSION).catch(() => { showDialog({ ru: "Не удалось сохранить выбор", uk: "Не вдалося зберегти вибір", en: "Could not save this choice" }[language], { ru: "Проверьте хранилище приложения. Без подтверждённой записи запрос может появиться снова.", uk: "Перевірте сховище застосунку. Без підтвердженого запису запит може з'явитися знову.", en: "Check app storage. Without a verified write, this prompt may appear again." }[language], [{ text: "OK" }]); }); } },
        { text: { ru: "Проверить доступы", uk: "Переглянути доступи", en: "Review permissions" }[language], onPress: () => router.push({ pathname: "/permissions-onboarding", params: { firstRunSetup: "1" } }) },
        ...(status.error?.code === "LEGACY_STATE_UNAVAILABLE" ? [{ text: { ru: "Открыть настройки Android", uk: "Відкрити налаштування Android", en: "Open Android settings" }[language], onPress: () => { void openRunCommandPermissionSettings(); } }] : []),
        startAction,
      ]);
    }).catch(() => undefined);
    return () => { mounted = false; };
  }, [language, router]);
  const { enabled: termuxEnabled } = useTermuxContext();
  const { colors } = useTheme();
  const { visible: packagesVisible, open: openPackages, close: closePackages } = usePackagesMenu();
  const { visible: consoleVisible, toggle: toggleConsole } = useTermuxConsole();
  const navigation = useNavigation();
  // GitHub Tool native header: ☰ → drawer, 👁 → console, 📦 → packages (same as RN header)
  useEffect(() => {
    const s1 = DeviceEventEmitter.addListener("aib_open_drawer", () => {
      try {
        navigation.dispatch(DrawerActions.openDrawer());
      } catch {
        /* ignore */
      }
    });
    const s2 = DeviceEventEmitter.addListener("aib_toggle_console", () => {
      try {
        toggleConsole();
      } catch {
        /* ignore */
      }
    });
    const s3 = DeviceEventEmitter.addListener("aib_open_packages", () => {
      try {
        openPackages();
      } catch {
        /* ignore */
      }
    });
    return () => {
      s1.remove();
      s2.remove();
      s3.remove();
    };
  }, [navigation, toggleConsole, openPackages]);

  return (
    <>
      <StatusBar style="light" />
      <Drawer
        drawerContent={(props) => <DrawerContent {...props} />}
        screenOptions={{
          headerStyle: {
            backgroundColor: colors.headerBg,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          },
          headerTintColor: colors.accent,
          headerTitleStyle: { color: colors.inkBright, fontWeight: "700", fontSize: 17 },
          headerTitle: ({ children }) => (
            <Text
              numberOfLines={1}
              style={{ color: colors.inkBright, fontWeight: "700", fontSize: 17 }}
            >
              {typeof children === "string" ? children : String(children ?? "")}
            </Text>
          ),
          drawerStyle: { backgroundColor: colors.drawerBg, width: 300 },
          drawerActiveBackgroundColor: colors.drawerActiveBg,
          drawerActiveTintColor: colors.accent,
          drawerInactiveTintColor: colors.muted,
          headerRight: () => (
            <>
              <TrafficInterceptorHeaderButton navigation={navigation} colors={colors} language={language} copy={{ traffic: t("trafficInterceptor"), liveHint: t("interceptorLiveHeaderHint"), idleHint: t("interceptorNotLiveHeaderHint") }} />
              <TouchableOpacity
                onPress={toggleConsole}
                style={{ marginRight: 10, padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityState={{ selected: consoleVisible }}
                accessibilityLabel={consoleVisible ? t("hideConsole") : t("showConsole")}
              >
                <Ionicons name={consoleVisible ? "eye-off-outline" : "eye-outline"} size={23} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openPackages}
                style={{ marginRight: 14, padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel={t("packagesMenu")}
              >
                <Ionicons name="cube-outline" size={22} color={colors.accent} />
              </TouchableOpacity>
            </>
          ),
        }}
      >
        <Drawer.Screen
          name="index"
          options={{
            title: termuxEnabled ? t("session") : "AI Builder",
            drawerLabel: termuxEnabled ? t("session") : t("chat"),
          }}
        />
        <Drawer.Screen name="chat-history" options={{ title: t("chatHistory"), drawerLabel: t("chatHistory") }} />
        <Drawer.Screen name="checkpoints" options={{ title: t("checkpoints"), drawerLabel: t("checkpoints") }} />
        <Drawer.Screen name="script-runner" options={{ title: t("scriptRunner"), drawerLabel: t("scriptRunner") }} />
        <Drawer.Screen name="runtime" options={{ title: t("runtimeEnvironment"), drawerLabel: t("runtimeEnvironment") }} />
        <Drawer.Screen name="interceptor" options={{ title: t("trafficInterceptor"), drawerLabel: t("trafficInterceptor") }} />
        <Drawer.Screen name="terminal" options={{ title: "Command terminal", drawerItemStyle: { display: "none" } }} />
        <Drawer.Screen name="permissions-onboarding" options={{ title: "Permissions & access", drawerItemStyle: { display: "none" } }} />
        <Drawer.Screen name="runtime-timeline" options={{ title: "Runtime timeline", drawerItemStyle: { display: "none" } }} />
        <Drawer.Screen name="settings" options={{ title: t("settings"), drawerLabel: t("settings") }} />
        <Drawer.Screen name="signing-keys" options={{ title: t("signingKeys"), drawerLabel: t("signingKeys") }} />
        <Drawer.Screen name="termux-settings" options={{ title: t("termuxSettings"), drawerLabel: t("termuxSettings") }} />
        <Drawer.Screen name="log-screen" options={{ title: t("log"), drawerLabel: t("log") }} />
        <Drawer.Screen name="github" options={{ title: "GitHub", drawerLabel: "GitHub" }} />
        <Drawer.Screen
          name="session-replay"
          options={{ title: t("sessionReplay"), drawerLabel: t("sessionReplay") }}
        />
        <Drawer.Screen name="about" options={{ title: t("aboutApp"), drawerLabel: t("aboutApp") }} />
        <Drawer.Screen name="commands-guide" options={{ title: t("commandsGuide"), drawerLabel: t("commandsGuide") }} />
        <Drawer.Screen name="settings-guide" options={{ title: t("settingsGuide"), drawerLabel: t("settingsGuide") }} />
        <Drawer.Screen name="user-guide" options={{ title: t("userGuide"), drawerLabel: t("userGuide") }} />

      </Drawer>
      <PackagesRightMenu visible={packagesVisible} onClose={closePackages} />
      <RuntimeStatusOverlay />
    </>
  );
}

type HeaderInterceptorCopy = Readonly<{ traffic: string; liveHint: string; idleHint: string }>;
type HeaderInterceptorLanguage = "ru" | "uk" | "en";
type HeaderInterceptorStatus = "running" | "starting" | "stopping" | "error" | "unsupported" | "stopped";
type HeaderInterceptorStateCopy = Readonly<Record<HeaderInterceptorLanguage, Readonly<Record<HeaderInterceptorStatus, Readonly<{ label: string; hint: string }>>>>>;
const interceptorHeaderCopy: HeaderInterceptorStateCopy = {
  ru: {
    running: { label: "Слушатель работает", hint: "Listener подтверждён как активный на loopback." },
    starting: { label: "Запуск слушателя", hint: "Запуск выполняется; активность ещё не подтверждена." },
    stopping: { label: "Остановка слушателя", hint: "Остановка listener выполняется." },
    error: { label: "Ошибка слушателя", hint: "Работа listener не подтверждена; откройте состояние." },
    unsupported: { label: "Listener недоступен", hint: "В этой сборке native listener недоступен." },
    stopped: { label: "Выключен", hint: "Работа listener не подтверждена; откройте состояние перехватчика." },
  },
  uk: {
    running: { label: "Слухач працює", hint: "Listener підтверджено як активний на loopback." },
    starting: { label: "Запуск слухача", hint: "Запуск триває; активність ще не підтверджено." },
    stopping: { label: "Зупинка слухача", hint: "Зупинка listener виконується." },
    error: { label: "Помилка слухача", hint: "Роботу listener не підтверджено; відкрийте стан." },
    unsupported: { label: "Listener недоступний", hint: "У цій збірці native listener недоступний." },
    stopped: { label: "Вимкнено", hint: "Роботу listener не підтверджено; відкрийте стан перехоплювача." },
  },
  en: {
    running: { label: "Listener running", hint: "Listener is confirmed active on loopback." },
    starting: { label: "Starting listener", hint: "Startup is in progress; activity is not confirmed yet." },
    stopping: { label: "Stopping listener", hint: "Listener shutdown is in progress." },
    error: { label: "Listener error", hint: "Listener is not confirmed live; open status." },
    unsupported: { label: "Listener unavailable", hint: "The native listener is unavailable in this build." },
    stopped: { label: "Stopped", hint: "Listener is not confirmed live; open interceptor status." },
  },
};

function TrafficInterceptorHeaderButton({ navigation, colors, language, copy }: {
  navigation: { navigate: (...args: any[]) => void };
  colors: ReturnType<typeof useTheme>["colors"];
  language: HeaderInterceptorLanguage;
  copy: HeaderInterceptorCopy;
}) {
  const runtime = useMemo(() => getRuntimeFacade(), []);
  const [snapshot, setSnapshot] = useState(() => runtime.interceptorEngine.getSnapshot());
  useEffect(() => runtime.interceptorEngine.subscribe(setSnapshot), [runtime]);
  const state = getInterceptorIndicatorState(snapshot);
  const isLive = isInterceptorListenerLive(snapshot);
  const color = state === "running" ? colors.success : state === "starting" || state === "stopping" ? colors.warning : state === "error" || state === "unsupported" ? colors.danger : colors.muted;
  const stateCopy = interceptorHeaderCopy[language]?.[state] ?? interceptorHeaderCopy.en.stopped;
  const hint = isLive ? copy.liveHint : state === "stopped" ? copy.idleHint : (stateCopy?.hint ?? copy.idleHint);
  return (
    <TouchableOpacity
      onPress={() => navigation.navigate("interceptor" as never)}
      style={{ marginRight: 6, minWidth: 48, minHeight: 48, alignItems: "center", justifyContent: "center" }}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={copy.traffic}
      accessibilityHint={hint}
      accessibilityState={{ selected: isLive, busy: state === "starting" || state === "stopping" }}
      accessibilityValue={{ text: stateCopy?.label ?? state }}
      testID="header-traffic-interceptor"
    >
      <Ionicons name="pulse-outline" size={22} color={color} />
    </TouchableOpacity>
  );
}

export default function RootLayout() {

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <LanguageProvider>
            <ErrorBoundary>
              <LoggerProvider>
                <DialogProvider>
                  <AppSettingsProvider>
                    <TermuxProvider>
                      <TermuxConsoleProvider>
                        <ProjectProvider>
                        <PackagesMenuProvider>
                          <LLMProvider>
                            <AppLayout />
                          </LLMProvider>
                        </PackagesMenuProvider>
                        </ProjectProvider>
                      </TermuxConsoleProvider>
                    </TermuxProvider>
                  </AppSettingsProvider>
                </DialogProvider>
              </LoggerProvider>
            </ErrorBoundary>
          </LanguageProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#101418" },
});
