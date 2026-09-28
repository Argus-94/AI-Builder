import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "./ThemeContext";
import { useLanguage } from "./LanguageContext";
import { deepseekModelEngine, translateDeepSeekError } from "../lib/deepseek-model";

interface DeepSeekModelsDialogProps {
  visible: boolean;
  onClose: () => void;
  apiKey: string;
  onApiKeyChange: (key: string) => void;
  onSave: (apiKey: string) => void;
  isLoading?: boolean;
}

export function DeepSeekModelsDialog({
  visible,
  onClose,
  apiKey,
  onApiKeyChange,
  onSave,
  isLoading = false,
}: DeepSeekModelsDialogProps) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const insets = useSafeAreaInsets();
  const [showKey, setShowKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const handleSave = useCallback(() => {
    const key = apiKey.trim();
    if (!key) {
      setTestResult(t("deepSeekKeyEmpty"));
      return;
    }
    onSave(key);
    onClose();
  }, [apiKey, onClose, onSave, t]);

  const handleTestKey = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      setTestResult(t("deepSeekKeyEmpty"));
      return;
    }
    setTestingKey(true);
    setTestResult(null);
    try {
      deepseekModelEngine.setApiKey(key);
      const result = await deepseekModelEngine.checkStatus();
      setTestResult(
        result.available
          ? t("deepSeekKeyValid", { latency: result.latency })
          : t("deepSeekKeyInvalid")
      );
    } catch (error) {
      setTestResult(translateDeepSeekError(error));
    } finally {
      setTestingKey(false);
    }
  }, [apiKey, t]);

  const openDeepSeekSite = useCallback(() => {
    void Linking.openURL("https://platform.deepseek.com").catch(() => {});
  }, []);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
      >
        <View
          style={[
            styles.dialog,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
              marginTop: insets.top + 8,
              marginBottom: insets.bottom + 8,
            },
          ]}
        >
          <View style={[styles.header, { borderBottomColor: colors.line }]}> 
            <View style={styles.titleWrap}>
              <View style={[styles.titleIcon, { backgroundColor: colors.accentDim }]}>
                <Text style={styles.titleEmoji}>🚀</Text>
              </View>
              <Text style={[styles.title, { color: colors.inkBright }]}>
                {t("deepSeekTitle")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={testingKey || isLoading}
              style={styles.closeButton}
              accessibilityRole="button"
              accessibilityLabel={t("close")}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.content}
            contentContainerStyle={styles.contentContainer}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            <View
              style={[
                styles.infoCard,
                { backgroundColor: colors.surfaceRaised, borderColor: colors.line },
              ]}
            >
              <Text style={[styles.infoTitle, { color: colors.inkBright }]}>DeepSeek-V3</Text>
              <Text style={[styles.infoText, { color: colors.ink }]}> 
                {t("deepSeekDescription")}
              </Text>
              <View style={styles.specs}>
                <Text style={[styles.spec, { color: colors.muted }]}>✓ {t("deepSeekContext")}</Text>
                <Text style={[styles.spec, { color: colors.muted }]}>✓ {t("deepSeekCodeSupport")}</Text>
                <Text style={[styles.spec, { color: colors.muted }]}>✓ {t("deepSeekApiSupport")}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.inkBright }]}>
                {t("deepSeekApiKeyLabel")}
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  { borderColor: colors.line, backgroundColor: colors.inputBg },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.inkBright }]}
                  placeholder="sk-..."
                  placeholderTextColor={colors.footerMuted}
                  value={apiKey}
                  onChangeText={(value) => {
                    setTestResult(null);
                    onApiKeyChange(value);
                  }}
                  secureTextEntry={!showKey}
                  editable={!isLoading && !testingKey}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                />
                <TouchableOpacity
                  onPress={() => setShowKey((value) => !value)}
                  style={styles.eyeButton}
                  disabled={testingKey || isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={showKey ? t("deepSeekHideKey") : t("deepSeekShowKey")}
                >
                  <Ionicons
                    name={showKey ? "eye" : "eye-off"}
                    size={21}
                    color={colors.muted}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity onPress={openDeepSeekSite} activeOpacity={0.7}>
                <Text style={[styles.hint, { color: colors.info }]}>
                  {t("deepSeekGetKey")}
                </Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[
                styles.testButton,
                {
                  backgroundColor: colors.accentDim,
                  borderColor: colors.accent,
                  opacity: testingKey || isLoading ? 0.55 : 1,
                },
              ]}
              onPress={handleTestKey}
              disabled={testingKey || isLoading}
              activeOpacity={0.75}
            >
              {testingKey ? (
                <ActivityIndicator color={colors.accent} size="small" />
              ) : (
                <Ionicons name="checkmark-circle-outline" size={19} color={colors.accent} />
              )}
              <Text style={[styles.testButtonText, { color: colors.accent }]}> 
                {testingKey ? t("deepSeekChecking") : t("deepSeekCheckKey")}
              </Text>
            </TouchableOpacity>

            {testResult ? (
              <Text style={[styles.testResult, { color: /✓|valid|действ|чинний/i.test(testResult) ? colors.success : colors.warning }]}> 
                {testResult}
              </Text>
            ) : null}

            <View
              style={[
                styles.warningCard,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.line,
                  borderLeftColor: colors.warning,
                },
              ]}
            >
              <View style={[styles.warningIcon, { backgroundColor: colors.accentDim }]}>
                <Ionicons name="information" size={17} color={colors.accent} />
              </View>
              <View style={styles.warningBody}>
                <Text style={[styles.warningTitle, { color: colors.warning }]}>
                  {t("deepSeekImportant")}
                </Text>
                <Text style={[styles.warningText, { color: colors.muted }]}> 
                  {t("deepSeekStorageNotice")}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}> 
            <TouchableOpacity
              style={[styles.footerButton, styles.cancelButton, { borderColor: colors.line }]}
              onPress={onClose}
              disabled={isLoading || testingKey}
              activeOpacity={0.75}
            >
              <Text style={[styles.footerText, { color: colors.muted }]}>{t("cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.saveButton,
                { backgroundColor: colors.accent, opacity: isLoading || testingKey ? 0.55 : 1 },
              ]}
              onPress={handleSave}
              disabled={isLoading || testingKey}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Ionicons name="checkmark" size={18} color={colors.background} />
              )}
              <Text style={[styles.footerText, { color: colors.background }]}>Сохранить ключ</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 14,
    backgroundColor: "rgba(2, 6, 16, 0.74)",
  },
  dialog: {
    width: "100%",
    maxWidth: 520,
    maxHeight: "88%",
    borderRadius: 22,
    borderWidth: 1,
    overflow: "hidden",
    elevation: 18,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
  },
  header: {
    minHeight: 64,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  titleIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  titleEmoji: { fontSize: 21 },
  title: { fontSize: 19, fontWeight: "800" },
  closeButton: { padding: 8, marginRight: -6 },
  content: { flexGrow: 0 },
  contentContainer: { padding: 16, paddingBottom: 18, gap: 14 },
  infoCard: { borderRadius: 15, borderWidth: 1, padding: 14 },
  infoTitle: { fontSize: 17, fontWeight: "800", marginBottom: 7 },
  infoText: { fontSize: 13, lineHeight: 20, marginBottom: 11 },
  specs: { gap: 5 },
  spec: { fontSize: 12.5, lineHeight: 18 },
  section: { gap: 7 },
  label: { fontSize: 14, fontWeight: "700" },
  inputContainer: {
    minHeight: 50,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 14,
    paddingRight: 7,
  },
  input: { flex: 1, minHeight: 48, fontSize: 14 },
  eyeButton: { padding: 9 },
  hint: { fontSize: 12.5, lineHeight: 18, fontWeight: "600" },
  testButton: {
    minHeight: 46,
    borderRadius: 13,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  testButtonText: { fontSize: 14, fontWeight: "800" },
  testResult: { fontSize: 12.5, lineHeight: 18, marginTop: -5 },
  warningCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
    padding: 12,
    flexDirection: "row",
    gap: 10,
  },
  warningIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  warningBody: { flex: 1 },
  warningTitle: { fontSize: 13, fontWeight: "800", marginBottom: 4 },
  warningText: { fontSize: 12, lineHeight: 18 },
  footer: {
    borderTopWidth: 1,
    padding: 14,
    flexDirection: "row",
    gap: 10,
  },
  footerButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 7,
  },
  cancelButton: { borderWidth: 1 },
  saveButton: { borderWidth: 1, borderColor: "transparent" },
  footerText: { fontSize: 14, fontWeight: "800" },
});
