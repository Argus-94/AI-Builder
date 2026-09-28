import { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useAppSettingsContext } from "./AppSettingsContext";
import { useTermuxContext } from "./TermuxContext";
import { computeReadiness, type ReadyLevel } from "../lib/readiness";
import { localModelEngine } from "../lib/local-model";
import { modelKeepAlive } from "../lib/keep-alive";

const LEVEL_COLOR: Record<ReadyLevel, string> = {
  ok: "#0D9488",
  warn: "#F59E0B",
  bad: "#EF4444",
  off: "#64748B",
};

export function ReadinessBar() {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { mode, onlineModel, model, customProvider, customProvider1, customProvider2, activeCustomSlot, openCode } =
    useAppSettingsContext() as ReturnType<typeof useAppSettingsContext> & {
      customProvider?: { apiKey?: string };
      customProvider1?: { apiKey?: string };
      customProvider2?: { apiKey?: string };
      activeCustomSlot?: 1 | 2;
      openCode?: { apiKey?: string };
    };
  const { enabled: termuxEnabled } = useTermuxContext();
  const [summary, setSummary] = useState("");
  const [levels, setLevels] = useState<ReadyLevel[]>([]);
  const [ramLoaded, setRamLoaded] = useState(false);
  const [pinned, setPinned] = useState(false);

  const refresh = useCallback(async () => {
    const loaded = localModelEngine.isLoaded() || !!model.loaded;
    let isPinned = false;
    try {
      isPinned = !!(modelKeepAlive.isPinned?.() || modelKeepAlive.isActive?.());
    } catch {
      isPinned = false;
    }
    setRamLoaded(loaded);
    setPinned(isPinned);

    const slot = activeCustomSlot === 2 ? customProvider2 : customProvider1 || customProvider;
    const customKey = !!(slot?.apiKey && String(slot.apiKey).trim());
    const ocKey = !!(openCode?.apiKey && String(openCode.apiKey).trim());

    const snap = await computeReadiness({
      hasApiKey: onlineModel.hasApiKey,
      hasCustomApiKey: customKey,
      hasOpenCodeApiKey: ocKey,
      mode: (mode as "local" | "online" | "custom" | "opencode" | "deepseek") || "local",
      localLoaded: loaded,
      localDownloaded: model.downloaded,
      termuxEnabled,
      labels: {
        api: t("readyApi"),
        modelOnline: t("readyModelOnline"),
        modelOffline: t("readyModelOffline"),
        modelOfflineNeed: t("readyModelOfflineNeed"),
        modelCustom: language === "en" ? "Custom ✓" : language === "uk" ? "Custom ✓" : "Custom ✓",
        modelOpenCode: "OpenCode",
        termuxOn: t("readyTermuxOn"),
        termuxOff: t("readyTermuxOff"),
        termuxNotReady: t("readyTermuxBad"),
      },
    });
    setSummary(snap.summary);
    setLevels(snap.items.map((i) => i.level));
  }, [
    onlineModel.hasApiKey,
    mode,
    model.loaded,
    model.downloaded,
    termuxEnabled,
    t,
    language,
    customProvider,
    customProvider1,
    customProvider2,
    activeCustomSlot,
    openCode,
  ]);

  useFocusEffect(
    useCallback(() => {
      refresh();
      const id = setInterval(refresh, 2500);
      return () => clearInterval(id);
    }, [refresh])
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!summary) return null;

  const isOffline = mode === "local" || mode === "offline";
  const isCustom = mode === "custom" || mode === "deepseek";
  const isOnline = mode === "online";
  const isOpenCode = mode === "opencode";

  const ramLabel = ramLoaded
    ? language === "en"
      ? pinned
        ? "RAM · pinned"
        : "RAM · loaded"
      : language === "uk"
        ? pinned
          ? "ОЗП · закріплено"
          : "ОЗП · в пам'яті"
        : pinned
          ? "ОЗУ · закреплена"
          : "ОЗУ · в памяти"
    : language === "en"
      ? "RAM · empty"
      : language === "uk"
        ? "ОЗП · порожньо"
        : "ОЗУ · пусто";

  const modeChipLabel = isCustom
    ? "Custom"
    : isOpenCode
      ? "OpenCode"
      : isOnline
        ? "Online"
        : null;

  const ramColor = ramLoaded ? "#0D9488" : "#64748B";
  const ramBg = ramLoaded ? "rgba(45,212,191,0.15)" : "rgba(100,116,139,0.12)";
  const modeColor = "#38BDF8";
  const modeBg = "rgba(56,189,248,0.15)";

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <View style={styles.dots}>
        {levels.map((lv, i) => (
          <View key={i} style={[styles.dot, { backgroundColor: LEVEL_COLOR[lv] }]} />
        ))}
      </View>
      <Text style={[styles.text, { color: colors.muted }]} numberOfLines={2}>
        {summary}
      </Text>
      {modeChipLabel ? (
        <View style={[styles.ramChip, { backgroundColor: modeBg, borderColor: modeColor }]}>
          <Ionicons name="cloud-outline" size={12} color={modeColor} />
          <Text style={[styles.ramText, { color: modeColor }]} numberOfLines={1}>
            {modeChipLabel}
          </Text>
        </View>
      ) : null}
      {isOffline || ramLoaded ? (
        <View style={[styles.ramChip, { backgroundColor: ramBg, borderColor: ramColor }]}>
          <Ionicons name={ramLoaded ? "hardware-chip" : "hardware-chip-outline"} size={12} color={ramColor} />
          <Text style={[styles.ramText, { color: ramColor }]} numberOfLines={1}>
            {ramLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dots: { flexDirection: "row", gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { flex: 1, fontSize: 11, lineHeight: 15 },
  ramChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
    maxWidth: 120,
  },
  ramText: { fontSize: 10, fontWeight: "700" },
});
