import { useMemo, useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useTermuxContext, type BuildStage } from "./TermuxContext";
import { countActivePipeline } from "../lib/build-pipeline-stages";

export function BuildProgressPanel({ compact = false }: { compact?: boolean } = {}) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { activity } = useTermuxContext();
  const [expanded, setExpanded] = useState(!compact);
  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);

  const stages = activity?.stages || [];
  const hasStages = stages.length > 0;
  // Show whenever stages exist (create-app / source build / recovery)
  if (!hasStages && !(activity?.isBuild && activity?.command)) return null;
  if (!hasStages) return null;

  const { done: completed, total, current } = countActivePipeline(stages);
  const progress = total ? Math.round((completed / total) * 100) : 0;
  const title =
    activity?.title ||
    (language === "en" ? "Build steps" : language === "uk" ? "Кроки збірки" : "Шаги сборки");

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <TouchableOpacity activeOpacity={0.8} onPress={() => setExpanded((v) => !v)} style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={[styles.iconWrap, { backgroundColor: colors.accentDim }]}>
            <Ionicons name="list-outline" size={17} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.title, { color: colors.inkBright }]}>{title}</Text>
            <Text style={[styles.subtitle, { color: colors.muted }]} numberOfLines={1}>
              {current?.label || activity?.stage || activity?.detail || "…"}
              {activity?.recovery
                ? ` · ${language === "en" ? "fix" : language === "uk" ? "виправлення" : "исправление"} ${activity.recovery}/${activity.maxRecovery || "?"}`
                : ""}
            </Text>
          </View>
        </View>
        <View style={styles.headerRight}>
          <Text style={[styles.counter, { color: colors.accent }]}>
            {completed} / {total}
          </Text>
          <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={17} color={colors.muted} />
        </View>
      </TouchableOpacity>

      <View style={[styles.track, { backgroundColor: colors.line }]}>
        <View
          style={[
            styles.fill,
            {
              width: `${Math.max(progress, current ? 6 : 0)}%`,
              backgroundColor: colors.accent,
            },
          ]}
        />
      </View>

      {expanded && (
        <View style={styles.body}>
          {stages.map((stage, index) => (
            <StageRow key={stage.id} stage={stage} isLast={index === stages.length - 1} colors={colors} />
          ))}
          {(activity?.diagnosis || activity?.action || activity?.result) && (
            <View style={[styles.smartBox, { backgroundColor: colors.background, borderColor: colors.line }]}>
              <View style={styles.smartHeader}>
                <View style={[styles.smartIcon, { backgroundColor: colors.accentDim }]}>
                  {activity?.result?.includes("завершено") || activity?.result?.includes("применено") ? (
                    <Ionicons name="checkmark-circle" size={15} color={colors.accent} />
                  ) : (
                    <ActivityIndicator size="small" color={colors.accent} />
                  )}
                </View>
                <Text style={[styles.smartTitle, { color: colors.inkBright }]}>{t("autoDiagnosis")}</Text>
              </View>
              {!!activity?.diagnosis && (
                <View style={styles.smartRow}>
                  <Text style={[styles.smartCaption, { color: colors.muted }]}>{t("detected")}</Text>
                  <Text style={[styles.smartText, { color: colors.inkBright }]} numberOfLines={3}>
                    {activity.diagnosis}
                  </Text>
                </View>
              )}
              {!!activity?.action && (
                <View style={styles.smartRow}>
                  <Text style={[styles.smartCaption, { color: colors.muted }]}>{t("action")}</Text>
                  <Text style={[styles.smartText, { color: colors.accent }]} numberOfLines={3}>
                    {activity.action}
                  </Text>
                </View>
              )}
              {!!activity?.result && (
                <View style={styles.smartRow}>
                  <Text style={[styles.smartCaption, { color: colors.muted }]}>{t("status")}</Text>
                  <Text style={[styles.smartText, { color: colors.inkBright }]} numberOfLines={2}>
                    {activity.result}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function StageRow({
  stage,
  isLast,
  colors,
}: {
  stage: BuildStage;
  isLast: boolean;
  colors: { line: string; accent: string; background: string; muted: string; inkBright: string };
}) {
  const skipped = stage.status === "skipped";
  const done = stage.status === "done";
  const active = stage.status === "active";
  const error = stage.status === "error";

  let borderColor = colors.line;
  let bg = colors.background;
  if (done) {
    borderColor = colors.accent;
    bg = colors.accent;
  } else if (error) {
    borderColor = "#EF4444";
    bg = "#EF4444";
  } else if (active) {
    borderColor = colors.accent;
    bg = "transparent";
  } else if (skipped) {
    borderColor = colors.line;
    bg = "transparent";
  }

  const labelColor = skipped ? colors.muted : error ? "#EF4444" : active ? colors.inkBright : done ? colors.inkBright : colors.muted;

  return (
    <View style={[styles.row, skipped && { opacity: 0.55 }]}>
      <View style={styles.markerCol}>
        <View style={[styles.marker, { borderColor, backgroundColor: bg }]}>
          {done ? (
            <Ionicons name="checkmark" size={11} color={colors.background} />
          ) : error ? (
            <Ionicons name="close" size={11} color="#fff" />
          ) : active ? (
            <ActivityIndicator size="small" color={colors.accent} />
          ) : skipped ? (
            <View style={[styles.skipDash, { backgroundColor: colors.muted }]} />
          ) : null}
        </View>
        {!isLast && (
          <View
            style={[
              styles.line,
              {
                backgroundColor: done ? colors.accent : colors.line,
              },
            ]}
          />
        )}
      </View>
      <View style={styles.stageText}>
        <Text
          style={[
            styles.stageLabel,
            {
              color: labelColor,
              textDecorationLine: skipped ? "line-through" : "none",
              fontWeight: active ? "700" : "500",
            },
          ]}
        >
          {stage.label}
        </Text>
        {active && !!stage.detail && (
          <Text style={[styles.detail, { color: colors.accent }]} numberOfLines={2}>
            {stage.detail}
          </Text>
        )}
        {error && !!stage.detail && (
          <Text style={[styles.detail, { color: "#EF4444" }]} numberOfLines={2}>
            {stage.detail}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 12, marginBottom: 7, borderRadius: 16, borderWidth: 1, overflow: "hidden" },
  header: { padding: 11, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  headerLeft: { flexDirection: "row", alignItems: "center", flex: 1, gap: 9 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 14, fontWeight: "700" },
  subtitle: { fontSize: 11, marginTop: 2 },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 7, marginLeft: 8 },
  counter: { fontSize: 11, fontWeight: "700" },
  track: { height: 5, marginHorizontal: 11, borderRadius: 3, overflow: "hidden" },
  fill: { height: "100%", borderRadius: 3 },
  body: { paddingHorizontal: 12, paddingBottom: 10, paddingTop: 8, maxHeight: 220 },
  row: { flexDirection: "row", minHeight: 28 },
  markerCol: { width: 22, alignItems: "center" },
  marker: {
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  skipDash: { width: 8, height: 2, borderRadius: 1 },
  line: { width: 2, flex: 1, marginTop: -1 },
  stageText: { flex: 1, paddingLeft: 7, paddingBottom: 6 },
  stageLabel: { fontSize: 12, lineHeight: 17 },
  detail: { fontSize: 10, lineHeight: 14, marginTop: 1 },
  smartBox: { marginTop: 5, borderWidth: 1, borderRadius: 11, padding: 9 },
  smartHeader: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  smartIcon: { width: 25, height: 25, borderRadius: 8, alignItems: "center", justifyContent: "center", marginRight: 7 },
  smartTitle: { fontSize: 11, fontWeight: "700" },
  smartRow: { marginTop: 4 },
  smartCaption: { fontSize: 9, marginBottom: 1 },
  smartText: { fontSize: 10, lineHeight: 14 },
});
