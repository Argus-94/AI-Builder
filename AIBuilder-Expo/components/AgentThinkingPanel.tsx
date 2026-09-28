/**
 * Панель «Думаю…» в стиле Grok-чата:
 *  - таймер «Думаю Ns»
 *  - заголовок текущего действия (лампочка)
 *  - список шагов (bullet)
 *  - выполненные команды (галочка)
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity, LayoutAnimation, Platform, UIManager, ScrollView, Dimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useTermuxContext } from "./TermuxContext";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

export type ThinkingLogItem = {
  id: string;
  kind: "plan" | "step" | "command" | "done" | "info";
  text: string;
  done?: boolean;
  at: number;
};

type Props = {
  /** Идёт генерация / агент */
  active: boolean;
  /** Доп. лог шагов из LLM (опционально) */
  log?: ThinkingLogItem[];
  /** Компактный режим (терминал открыт): свёрнут по умолчанию, меньше maxHeight */
  compact?: boolean;
};

export function AgentThinkingPanel({ active, log = [], compact = false }: Props) {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { activity } = useTermuxContext();
  const [expanded, setExpanded] = useState(!compact);
  useEffect(() => {
    if (compact) setExpanded(false);
  }, [compact]);
  const [seconds, setSeconds] = useState(0);
  const startedAt = useRef<number | null>(null);
  const [history, setHistory] = useState<ThinkingLogItem[]>([]);
  const lastCmd = useRef<string>("");
  const scrollRef = useRef<ScrollView>(null);

  // Таймер «Думаю Ns»
  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setSeconds(0);
      return;
    }
    if (!startedAt.current) startedAt.current = Date.now();
    const t = setInterval(() => {
      if (startedAt.current) setSeconds(Math.floor((Date.now() - startedAt.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [active]);

  // Накапливаем историю из termux activity + внешний log
  useEffect(() => {
    if (!active) return;
    if (activity?.command && activity.command !== lastCmd.current) {
      lastCmd.current = activity.command;
      const cmdShort =
        activity.command.length > 120 ? activity.command.slice(0, 117) + "…" : activity.command;
      setHistory((prev) => {
        // пометить предыдущие command как done
        const marked = prev.map((h) =>
          h.kind === "command" && !h.done ? { ...h, done: true } : h
        );
        return [
          ...marked,
          {
            id: `cmd-${Date.now()}`,
            kind: "command" as const,
            text: cmdShort,
            done: false,
            at: Date.now(),
          },
        ].slice(-40);
      });
    }
    if (activity?.title || activity?.detail || activity?.stage) {
      const title = activity.title || activity.stage || activity.detail || "";
      if (title) {
        setHistory((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.kind === "plan" && last.text === title) return prev;
          return [
            ...prev,
            {
              id: `plan-${Date.now()}`,
              kind: "plan" as const,
              text: title,
              at: Date.now(),
            },
          ].slice(-40);
        });
      }
    }
    if (activity?.step && activity?.maxSteps) {
      const stepText =
        language === "en"
          ? `Step ${activity.step}/${activity.maxSteps}`
          : language === "uk"
            ? `Крок ${activity.step}/${activity.maxSteps}`
            : `Шаг ${activity.step}/${activity.maxSteps}`;
      setHistory((prev) => {
        const last = prev[prev.length - 1];
        if (last && last.kind === "step" && last.text.startsWith(stepText.split("/")[0])) {
          return prev.map((h, i) => (i === prev.length - 1 ? { ...h, text: stepText } : h));
        }
        return [...prev, { id: `step-${Date.now()}`, kind: "step" as const, text: stepText, at: Date.now() }].slice(-40);
      });
    }
  }, [activity?.command, activity?.title, activity?.detail, activity?.stage, activity?.step, activity?.maxSteps, active, language]);

  // Сброс истории при новом запуске
  useEffect(() => {
    if (active) {
      setHistory([]);
      lastCmd.current = "";
      setExpanded(true);
    }
  }, [active]);

  // Подмешиваем внешний log
  const items = useMemo(() => {
    const merged = [...history];
    for (const l of log) {
      if (!merged.find((m) => m.id === l.id)) merged.push(l);
    }
    return merged.sort((a, b) => a.at - b.at).slice(-30);
  }, [history, log]);

  // Автопрокрутка к последнему шагу/команде
  useEffect(() => {
    if (!expanded || !active) return;
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: false });
    }, 80);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [items.length, activity?.command, activity?.step, activity?.title, expanded, active]);

  if (!active) return null;

  const formatThinkingTime = (sec: number): string => {
    if (sec < 60) {
      return language === "en" ? `${sec}s` : language === "uk" ? `${sec}с` : `${sec}s`;
    }
    const m = Math.floor(sec / 60);
    const r = sec % 60;
    if (language === "en") return r > 0 ? `${m}m ${r}s` : `${m}m`;
    if (language === "uk") return r > 0 ? `${m}хв ${r}с` : `${m}хв`;
    return r > 0 ? `${m}м ${r}с` : `${m}м`;
  };
  const thinkingLabel =
    language === "en"
      ? `Thinking ${formatThinkingTime(seconds)}`
      : language === "uk"
        ? `Думаю ${formatThinkingTime(seconds)}`
        : `Думаю ${formatThinkingTime(seconds)}`;

  const headline =
    activity?.title ||
    activity?.stage ||
    (activity?.command
      ? language === "en"
        ? "Running Termux command"
        : language === "uk"
          ? "Виконую команду Termux"
          : "Выполняю команду Termux"
      : language === "en"
        ? "Working on your request"
        : language === "uk"
          ? "Працюю над запитом"
          : "Работаю над запросом");

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setExpanded((e) => !e);
  };

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.line }]}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.7}>
        <Ionicons name="ellipse" size={8} color={colors.accent} style={{ marginRight: 6 }} />
        <Text style={[styles.thinking, { color: colors.muted }]}>{thinkingLabel}</Text>
        <Ionicons
          name={expanded ? "chevron-up" : "chevron-down"}
          size={16}
          color={colors.muted}
          style={{ marginLeft: "auto" }}
        />
      </TouchableOpacity>

      {expanded && (
        <ScrollView
          ref={scrollRef}
          style={[styles.bodyScroll, { maxHeight: compact
            ? Math.min(120, Math.round(Dimensions.get("window").height * 0.16))
            : Math.min(180, Math.round(Dimensions.get("window").height * 0.24)) }]}
          contentContainerStyle={styles.body}
          nestedScrollEnabled
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator
          onContentSizeChange={() => {
            if (expanded) scrollRef.current?.scrollToEnd({ animated: false });
          }}
        >
          <View style={styles.planRow}>
            <Ionicons name="bulb-outline" size={16} color={colors.accent} />
            <Text style={[styles.planTitle, { color: colors.inkBright }]} numberOfLines={2}>
              {headline}
            </Text>
          </View>

          {items.map((item) => {
            if (item.kind === "command") {
              return (
                <View key={item.id} style={styles.row}>
                  <Ionicons
                    name={item.done ? "checkbox-outline" : "square-outline"}
                    size={15}
                    color={item.done ? colors.success : colors.muted}
                  />
                  <Text style={[styles.cmdText, { color: colors.muted }]} numberOfLines={2}>
                    {language === "en"
                      ? item.done
                        ? `Command done: ${item.text}`
                        : `Running: ${item.text}`
                      : language === "uk"
                        ? item.done
                          ? `Виконана команда: ${item.text}`
                          : `Виконую: ${item.text}`
                        : item.done
                          ? `Выполнена команда: ${item.text}`
                          : `Выполняю: ${item.text}`}
                  </Text>
                </View>
              );
            }
            if (item.kind === "plan") {
              return (
                <View key={item.id} style={styles.row}>
                  <Ionicons name="bulb-outline" size={14} color={colors.accent} />
                  <Text style={[styles.bulletText, { color: colors.inkBright }]} numberOfLines={2}>
                    {item.text}
                  </Text>
                </View>
              );
            }
            return (
              <View key={item.id} style={styles.row}>
                <Text style={{ color: colors.muted, fontSize: 12 }}>•</Text>
                <Text style={[styles.bulletText, { color: colors.muted }]} numberOfLines={2}>
                  {item.text}
                </Text>
              </View>
            );
          })}

          {!!activity?.command && (
            <View style={[styles.liveCmd, { borderColor: colors.line, backgroundColor: colors.surfaceRaised }]}>
              <Text style={{ color: colors.info, fontSize: 10, fontWeight: "700" }}>
                {activity.step && activity.maxSteps ? `${activity.step}/${activity.maxSteps}` : "Termux"}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, flex: 1 }} numberOfLines={2}>
                $ {activity.command}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    maxHeight: Math.round(Dimensions.get("window").height * 0.32),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  thinking: { fontSize: 12, fontWeight: "600" },
  bodyScroll: { flexGrow: 0 },
  body: { paddingHorizontal: 12, paddingBottom: 10, gap: 6 },
  planRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  planTitle: { fontSize: 13, fontWeight: "700", flex: 1, lineHeight: 18 },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingLeft: 2 },
  bulletText: { fontSize: 12, flex: 1, lineHeight: 17 },
  cmdText: { fontSize: 11, flex: 1, lineHeight: 16, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  liveCmd: {
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    padding: 8,
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
});
