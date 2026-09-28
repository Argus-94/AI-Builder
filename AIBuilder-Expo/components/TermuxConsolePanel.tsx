import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { useTermuxContext } from "./TermuxContext";
import { useTermuxConsole } from "./TermuxConsoleContext";

export function TermuxConsolePanel() {
  const { colors } = useTheme();
  const { language } = useLanguage();
  const { enabled } = useTermuxContext();
  const {
    lines,
    command,
    setCommand,
    execute,
    clear,
    history,
    running,
    queueDepth,
    highPending,
    tabs,
    activeTabId,
    setActiveTabId,
    addTab,
    closeTab,
  } = useTermuxConsole();
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    });
    const t = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 60);
    return () => {
      cancelAnimationFrame(id);
      clearTimeout(t);
    };
  }, [lines.length]);

  const title = "Termux";
  const previousCommand = () => {
    if (!history.length) return;
    const next = Math.min(historyIndex + 1, history.length - 1);
    setHistoryIndex(next);
    setCommand(history[next]);
  };
  const nextCommand = () => {
    if (historyIndex <= 0) {
      setHistoryIndex(-1);
      setCommand("");
      return;
    }
    const next = historyIndex - 1;
    setHistoryIndex(next);
    setCommand(history[next]);
  };
  const hint =
    language === "en"
      ? "Type a command… (priority over agent)"
      : language === "uk"
        ? "Введіть команду… (пріоритет над агентом)"
        : "Введите команду… (приоритет над агентом)";

  const statusLabel = (() => {
    if (!enabled) return language === "en" ? "off" : language === "uk" ? "вимк." : "выкл.";
    if (running) return language === "en" ? "running" : language === "uk" ? "виконується" : "выполняется";
    if (highPending > 0)
      return language === "en"
        ? `queued ×${highPending} (you)`
        : language === "uk"
          ? `черга ×${highPending} (ви)`
          : `очередь ×${highPending} (вы)`;
    if (queueDepth > 0)
      return language === "en"
        ? `queue ×${queueDepth}`
        : language === "uk"
          ? `черга ×${queueDepth}`
          : `очередь ×${queueDepth}`;
    return "idle · live";
  })();

  const lineColor = (kind: string) => {
    switch (kind) {
      case "prompt":
        return colors.accent;
      case "stderr":
        return colors.danger || "#F87171";
      case "system":
        return colors.muted;
      default:
        return "#D1D5DB";
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={[styles.wrap, { backgroundColor: "#0B0F14", borderBottomColor: colors.line }]}
    >
      <View style={[styles.titleBar, { borderBottomColor: colors.line }]}>
        <View style={styles.titleLeft}>
          <Ionicons name="terminal-outline" size={15} color={colors.accent} />
          <Text style={[styles.title, { color: colors.inkBright }]}>{title}</Text>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: !enabled
                  ? colors.warning
                  : running
                    ? colors.accent
                    : colors.success,
              },
            ]}
          />
          <Text style={{ color: colors.muted, fontSize: 10 }} numberOfLines={1}>
            {statusLabel}
          </Text>
        </View>
        {running ? (
          <Text style={{ color: colors.accent, fontSize: 10, fontWeight: "700" }}>●</Text>
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.output}
        contentContainerStyle={styles.outputContent}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: false })}
      >
        {lines.length === 0 ? (
          <Text style={[styles.line, { color: colors.muted }]}>
            {language === "en"
              ? "# Output appears here exactly as in Termux. Your commands jump the agent queue."
              : language === "uk"
                ? "# Вивід тут як у справжньому Termux. Ваші команди йдуть попереду черги агента."
                : "# Вывод здесь как в настоящем Termux. Ваши команды идут впереди очереди агента."}
          </Text>
        ) : (
          lines.map((line) => (
            <Text
              key={line.id}
              selectable
              style={[styles.line, { color: lineColor(line.kind) }]}
            >
              {line.text}
            </Text>
          ))
        )}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 36, marginBottom: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 4 }}>
          {tabs.map((tab) => (
            <TouchableOpacity
              key={tab.id}
              onPress={() => setActiveTabId(tab.id)}
              onLongPress={() => closeTab(tab.id)}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: tab.id === activeTabId ? colors.accent : colors.surfaceRaised || colors.surface,
              }}
            >
              <Text style={{ color: tab.id === activeTabId ? "#fff" : colors.inkBright, fontSize: 12, fontWeight: "600" }}>
                {tab.title}
              </Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={addTab} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
            <Ionicons name="add" size={18} color={colors.accent} />
          </TouchableOpacity>
        </View>
      </ScrollView>
      <View style={[styles.commandRow, { borderTopColor: colors.line }]}>
        <Text style={[styles.prompt, { color: colors.accent }]}>$</Text>
        <TextInput
          value={command}
          onChangeText={(value) => {
            setCommand(value);
            setHistoryIndex(-1);
          }}
          onSubmitEditing={() => void execute()}
          placeholder={hint}
          placeholderTextColor={colors.muted}
          style={[styles.input, { color: colors.inkBright }]}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="send"
          // Allow typing while another job runs — command will queue at high priority
          editable={enabled}
        />
        <TouchableOpacity onPress={previousCommand} disabled={!history.length} style={styles.toolButton}>
          <Ionicons name="chevron-up" size={18} color={history.length ? colors.muted : colors.line} />
        </TouchableOpacity>
        <TouchableOpacity onPress={nextCommand} disabled={historyIndex < 0} style={styles.toolButton}>
          <Ionicons name="chevron-down" size={18} color={historyIndex >= 0 ? colors.muted : colors.line} />
        </TouchableOpacity>
        <TouchableOpacity onPress={clear} disabled={!lines.length} style={styles.toolButton}>
          <Ionicons name="trash-outline" size={18} color={lines.length ? colors.muted : colors.line} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => void execute()}
          disabled={!command.trim() || !enabled}
          style={styles.send}
        >
          <Ionicons
            name="arrow-up-circle"
            size={25}
            color={command.trim() && enabled ? colors.accent : colors.muted}
          />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, minHeight: 160, borderBottomWidth: 1, overflow: "hidden" },
  titleBar: {
    height: 34,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10,
  },
  titleLeft: { flexDirection: "row", alignItems: "center", gap: 6, flex: 1 },
  title: { fontSize: 12, fontWeight: "700" },
  dot: { width: 7, height: 7, borderRadius: 4, marginLeft: 2 },
  output: { flex: 1, minHeight: 72 },
  outputContent: { paddingHorizontal: 10, paddingVertical: 8, paddingBottom: 12 },
  line: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 12,
    lineHeight: 17,
  },
  commandRow: {
    minHeight: 44,
    borderTopWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 9,
  },
  prompt: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
    fontWeight: "700",
    marginRight: 7,
  },
  input: {
    flex: 1,
    minHeight: 40,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
  },
  toolButton: { paddingHorizontal: 3, paddingVertical: 5 },
  send: { paddingLeft: 6 },
});
