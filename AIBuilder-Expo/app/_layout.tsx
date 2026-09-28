import { GestureHandlerRootView } from "react-native-gesture-handler";
import { Drawer } from "expo-router/drawer";
import { StatusBar } from "expo-status-bar";
import { StyleSheet, TouchableOpacity } from "react-native";
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
import { ThemeProvider, useTheme } from "../components/ThemeContext";
import { ProjectProvider } from "../components/ProjectContext";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { PackagesMenuProvider, usePackagesMenu } from "../components/PackagesMenuContext";
import { PackagesRightMenu } from "../components/PackagesRightMenu";
import { installGlobalErrorHandlers } from "../lib/crash-handlers";
import { initAppNotifications } from "../lib/app-notifications";
import { useEffect } from "react";
import { getRuntimeFacade } from "../lib/runtime-facade";

installGlobalErrorHandlers();

function AppLayout() {
  usePermissions();
  useEffect(() => {
    void initAppNotifications();
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
  const { enabled: termuxEnabled } = useTermuxContext();
  const { colors } = useTheme();
  const { visible: packagesVisible, open: openPackages, close: closePackages } = usePackagesMenu();
  const { visible: consoleVisible, toggle: toggleConsole } = useTermuxConsole();

  return (
    <>
      <StatusBar style="light" />
      <Drawer
        key={language}
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
          drawerStyle: { backgroundColor: colors.drawerBg, width: 300 },
          drawerActiveBackgroundColor: colors.drawerActiveBg,
          drawerActiveTintColor: colors.accent,
          drawerInactiveTintColor: colors.muted,
          headerRight: () => (
            <>
              <TouchableOpacity
                onPress={toggleConsole}
                style={{ marginRight: 10, padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityState={{ selected: consoleVisible }}
                accessibilityLabel={consoleVisible ? "Hide Termux console" : "Show Termux console"}
              >
                <Ionicons name={consoleVisible ? "eye-off-outline" : "eye-outline"} size={23} color={colors.accent} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={openPackages}
                style={{ marginRight: 14, padding: 4 }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Packages"
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
        <Drawer.Screen name="runtime" options={{ title: t("runtime"), drawerLabel: t("runtime") }} />
        <Drawer.Screen name="settings" options={{ title: t("settings"), drawerLabel: t("settings") }} />
        <Drawer.Screen name="signing-keys" options={{ title: t("signingKeys"), drawerLabel: t("signingKeys") }} />
        <Drawer.Screen name="termux-settings" options={{ title: t("termuxSettings"), drawerLabel: t("termuxSettings") }} />
        <Drawer.Screen name="log-screen" options={{ title: t("log"), drawerLabel: t("log") }} />
        <Drawer.Screen
          name="session-replay"
          options={{ title: t("sessionReplay"), drawerLabel: t("sessionReplay") }}
        />
        <Drawer.Screen name="about" options={{ title: t("aboutApp"), drawerLabel: t("aboutApp") }} />
        <Drawer.Screen name="commands-guide" options={{ title: t("commandsGuide"), drawerLabel: t("commandsGuide") }} />
        <Drawer.Screen name="settings-guide" options={{ title: t("settingsGuide"), drawerLabel: t("settingsGuide") }} />

      </Drawer>
      <PackagesRightMenu visible={packagesVisible} onClose={closePackages} />
      <RuntimeStatusOverlay />
    </>
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
  container: { flex: 1, backgroundColor: "#0B1220" },
});
