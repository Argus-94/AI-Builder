import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLLMContext } from "../components/LLMContext";
import { useDialog } from "../components/DialogContext";
import { useLanguage } from "../components/LanguageContext";
import { useTheme } from "../components/ThemeContext";

export default function ChatHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { showDialog } = useDialog();
  const { t, language } = useLanguage();
  const { colors } = useTheme();
  const { sessions, currentSessionId, setCurrentSessionId, deleteChat } = useLLMContext();

  const handleDelete = (id: string, title: string) => {
    showDialog(t("deleteChat"), `${t("deleteChat")} "${title}"?`, [
      { text: t("cancel"), style: "cancel" },
      { text: t("delete"), style: "destructive", onPress: () => deleteChat(id) },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.inkBright }]}>{t("chatHistoryTitle")}</Text>
      <FlatList
        data={sessions}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.list, { paddingBottom: 16 + insets.bottom }]}
        renderItem={({ item }) => {
          const active = item.id === currentSessionId;
          return (
            <TouchableOpacity
              style={[
                styles.chatCard,
                {
                  backgroundColor: colors.surface,
                  borderColor: active ? colors.accent : colors.line,
                },
                active && { backgroundColor: colors.accentDim },
              ]}
              onPress={() => {
                setCurrentSessionId(item.id);
                router.navigate("/");
              }}
            >
              <View style={styles.chatInfo}>
                <Text
                  style={[
                    styles.chatTitle,
                    { color: active ? colors.accent : colors.inkBright },
                  ]}
                >
                  {item.title}
                </Text>
                <Text style={[styles.chatDate, { color: colors.muted }]}>
                  {new Date(item.createdAt).toLocaleDateString(
                    language === "en" ? "en-US" : language === "uk" ? "uk-UA" : "ru-RU"
                  )}
                </Text>
                <Text style={[styles.chatPreview, { color: colors.footerMuted }]} numberOfLines={1}>
                  {item.messages[item.messages.length - 1]?.content.slice(0, 60) || t("noMessages")}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDelete(item.id, item.title)}
              >
                <Text style={styles.deleteText}>🗑️</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 16 },
  list: { gap: 12 },
  chatCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
  },
  chatInfo: { flex: 1 },
  chatTitle: { fontSize: 15, fontWeight: "600" },
  chatDate: { fontSize: 11, marginTop: 2 },
  chatPreview: { fontSize: 12, marginTop: 4 },
  deleteButton: { padding: 8 },
  deleteText: { fontSize: 16 },
});
