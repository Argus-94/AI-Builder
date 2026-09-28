import { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "../components/LanguageContext";
import { useTheme } from "../components/ThemeContext";
import {
  TERMUX_COMMANDS,
  TERMUX_COMMAND_CATEGORIES,
  filterTermuxCommands,
  type CommandLang,
} from "../lib/termux-commands";

const MONO = Platform.select({ android: "monospace", ios: "Menlo", default: "monospace" });

export default function CommandsGuideScreen() {
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const listBottomPad = Math.max(insets.bottom, 12) + 28;
  const lang = (language === "en" || language === "ru" ? language : "uk") as CommandLang;
  const [query, setQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const data = useMemo(() => filterTermuxCommands(query, lang), [query, lang]);

  const onCopy = useCallback(async (id: string, command: string) => {
    await Clipboard.setStringAsync(command);
    setCopiedId(id);
    setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
  }, []);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.hint, { color: colors.muted }]}>{t("commandsGuideHint")}</Text>
      <TextInput
        style={[
          styles.search,
          {
            backgroundColor: colors.surface,
            borderColor: colors.line,
            color: colors.inkBright,
          },
        ]}
        value={query}
        onChangeText={setQuery}
        placeholder={t("commandsGuideSearch")}
        placeholderTextColor={colors.footerMuted}
        autoCapitalize="none"
        autoCorrect={false}
        clearButtonMode="while-editing"
      />
      <Text style={[styles.count, { color: colors.footerMuted }]}>
        {t("commandsGuideCount", { count: data.length, total: TERMUX_COMMANDS.length })}
      </Text>
      <FlatList
        data={data}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: listBottomPad }]}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        renderItem={({ item }) => {
          const cat =
            TERMUX_COMMAND_CATEGORIES[item.category as keyof typeof TERMUX_COMMAND_CATEGORIES]?.[
              lang
            ] || item.category;
          const copied = copiedId === item.id;
          return (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.surface, borderColor: colors.line },
              ]}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.name, { color: colors.inkBright }]}>{item.name[lang]}</Text>
                <View style={[styles.catBadge, { backgroundColor: colors.accentDim }]}>
                  <Text style={[styles.catText, { color: colors.accent }]}>{cat}</Text>
                </View>
              </View>
              <Text style={[styles.desc, { color: colors.muted }]}>{item.description[lang]}</Text>
              <View
                style={[
                  styles.cmdBlock,
                  { backgroundColor: colors.background, borderColor: colors.line },
                ]}
              >
                <Text style={[styles.cmd, { color: colors.inkBright, fontFamily: MONO }]} selectable>
                  {item.command}
                </Text>
                <TouchableOpacity
                  style={[
                    styles.copyBtn,
                    { backgroundColor: colors.accentDim },
                    copied && { backgroundColor: colors.accentGlow },
                  ]}
                  onPress={() => onCopy(item.id, item.command)}
                >
                  <Text style={[styles.copyBtnText, { color: colors.accent }]}>
                    {copied ? t("termuxCopiedOne") : t("termuxCopyOne")}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.footerMuted }]}>{t("commandsGuideEmpty")}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  search: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  count: { fontSize: 11, marginTop: 8, marginBottom: 8 },
  list: {},
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  name: { fontSize: 15, fontWeight: "700", flex: 1 },
  catBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  catText: { fontSize: 10, fontWeight: "700" },
  desc: { fontSize: 13, lineHeight: 18, marginTop: 6 },
  cmdBlock: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    padding: 10,
  },
  cmd: {
    fontSize: 12.5,
    lineHeight: 18,
  },
  copyBtn: {
    alignSelf: "flex-end",
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  copyBtnText: { fontSize: 12, fontWeight: "700" },
  empty: { textAlign: "center", marginTop: 40, fontSize: 14 },
});
