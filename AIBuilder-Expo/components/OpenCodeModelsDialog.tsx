import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
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
import {
  fetchCustomProviderModels,
  groupProviderModels,
  type FetchedModel,
  type GroupedProviderModels,
} from "../lib/custom-provider";

export interface OpenCodeConfig {
  baseUrl: string;
  modelId: string;
  apiKey: string;
}

interface OpenCodeModelsDialogProps {
  visible: boolean;
  onClose: () => void;
  config: OpenCodeConfig;
  onConfigChange: (config: Partial<OpenCodeConfig>) => void;
  onSave: (config: OpenCodeConfig) => void;
  isLoading?: boolean;
}

/**
 * Настройки → "OpenCode": та же карточка-модалка, что и для DeepSeek /
 * Custom provider — с инфо-карточкой, полями Base URL / Model ID / API-ключ
 * и предупреждением о локальном хранении ключа. Раньше эти поля рисовались
 * прямо на экране настроек как длинная встроенная форма (не как модалка) —
 * из-за этого стиль расходился с остальными разделами; теперь оформление
 * единое для всех интеграций.
 */
export function OpenCodeModelsDialog({
  visible,
  onClose,
  config,
  onConfigChange,
  onSave,
  isLoading = false,
}: OpenCodeModelsDialogProps) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const insets = useSafeAreaInsets();
  const [showKey, setShowKey] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [groupedModels, setGroupedModels] = useState<GroupedProviderModels>({
    free: [],
    paid: [],
    unsuitable: [],
  });
  const [fetchedModels, setFetchedModels] = useState<FetchedModel[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState<string>("");
  const [checkingKey, setCheckingKey] = useState(false);
  const [keyCheckResult, setKeyCheckResult] = useState<{ valid: boolean; message: string } | null>(null);

  const handleCheckKey = useCallback(async () => {
    if (!config.apiKey.trim()) {
      setKeyCheckResult({ valid: false, message: t("apiKeyEmpty") });
      return;
    }
    if (!config.baseUrl.trim()) {
      setErrors((e) => ({ ...e, baseUrl: t("customProviderUrlRequired") }));
      return;
    }
    setCheckingKey(true);
    setKeyCheckResult(null);
    try {
      await fetchCustomProviderModels({ baseUrl: config.baseUrl, apiKey: config.apiKey });
      setKeyCheckResult({ valid: true, message: t("apiKeyValid") });
    } catch (e) {
      setKeyCheckResult({
        valid: false,
        message: `${t("apiKeyInvalid")}: ${e instanceof Error ? e.message : String(e)}`,
      });
    } finally {
      setCheckingKey(false);
    }
  }, [config.baseUrl, config.apiKey, t]);

  const handleFetchModels = useCallback(async () => {
    if (!config.baseUrl.trim()) {
      setErrors((e) => ({ ...e, baseUrl: t("customProviderUrlRequired") }));
      return;
    }
    setModelsLoading(true);
    setModelsError("");
    try {
      const models = await fetchCustomProviderModels({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
      });
      const grouped = groupProviderModels(models);
      setGroupedModels(grouped);
      const chatModels = [...grouped.free, ...grouped.paid];
      setFetchedModels(chatModels);
      if (chatModels.length === 0) {
        setModelsError(
          models.length > 0
            ? "Провайдер вернул модели, но среди них нет подходящих для text chat."
            : t("customProviderFetchModelsEmpty")
        );
      } else if (!chatModels.some((m) => m.id === config.modelId)) {
        onConfigChange({ modelId: (grouped.free[0] || chatModels[0]).id });
      }
    } catch (e) {
      setFetchedModels([]);
      setGroupedModels({ free: [], paid: [], unsuitable: [] });
      setModelsError(`${t("customProviderFetchModelsError")}: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setModelsLoading(false);
    }
  }, [config.baseUrl, config.apiKey, t]);

  const validateConfig = useCallback((): boolean => {
    const newErrors: Record<string, string> = {};
    if (!config.baseUrl.trim()) newErrors.baseUrl = t("customProviderUrlRequired");
    if (!config.modelId.trim()) newErrors.modelId = t("customProviderModelRequired");
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [config, t]);

  const handleSave = useCallback(() => {
    if (validateConfig()) {
      onSave(config);
      onClose();
    }
  }, [config, onClose, onSave, validateConfig]);

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
                <Text style={styles.titleEmoji}>🧩</Text>
              </View>
              <Text style={[styles.title, { color: colors.inkBright }]}>
                {t("openCodeDialogTitle")}
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isLoading}
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
              <Text style={[styles.infoTitle, { color: colors.inkBright }]}>OpenCode</Text>
              <Text style={[styles.infoText, { color: colors.ink }]}>
                {t("openCodeHint")}
              </Text>
              <View style={styles.specs}>
                <Text style={[styles.spec, { color: colors.muted }]}>✓ {t("customProviderAnyApi")}</Text>
                <Text style={[styles.spec, { color: colors.muted }]}>✓ {t("openCodeDialogModelDesc")}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.inkBright }]}>
                {t("customProviderBaseUrl")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  { borderColor: errors.baseUrl ? colors.warning : colors.line, backgroundColor: colors.inputBg },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.inkBright }]}
                  placeholder="https://opencode.ai/zen/v1"
                  placeholderTextColor={colors.footerMuted}
                  value={config.baseUrl}
                  onChangeText={(value) => {
                    onConfigChange({ baseUrl: value });
                    if (errors.baseUrl) setErrors({ ...errors, baseUrl: "" });
                  }}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                />
              </View>
              {errors.baseUrl && (
                <Text style={[styles.errorText, { color: colors.warning }]}>{errors.baseUrl}</Text>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.inkBright }]}>
                {t("customProviderModelId")} *
              </Text>
              <View
                style={[
                  styles.inputContainer,
                  { borderColor: errors.modelId ? colors.warning : colors.line, backgroundColor: colors.inputBg },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: colors.inkBright }]}
                  placeholder="deepseek-v4-flash-free"
                  placeholderTextColor={colors.footerMuted}
                  value={config.modelId}
                  onChangeText={(value) => {
                    onConfigChange({ modelId: value });
                    if (errors.modelId) setErrors({ ...errors, modelId: "" });
                  }}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>
              {errors.modelId && (
                <Text style={[styles.errorText, { color: colors.warning }]}>{errors.modelId}</Text>
              )}
            </View>

            <View style={styles.section}>
              <TouchableOpacity
                style={[
                  styles.fetchButton,
                  { borderColor: colors.accent, backgroundColor: colors.accentDim, opacity: modelsLoading ? 0.7 : 1 },
                ]}
                onPress={handleFetchModels}
                disabled={modelsLoading || isLoading}
                activeOpacity={0.8}
              >
                {modelsLoading ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Ionicons name="refresh" size={16} color={colors.accent} />
                )}
                <Text style={[styles.fetchButtonText, { color: colors.accent }]}>
                  {modelsLoading ? t("customProviderFetchingModels") : t("customProviderFetchModels")}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.helperText, { color: colors.muted }]}>
                {t("customProviderModelsHint")}
              </Text>
              {!!modelsError && (
                <Text style={[styles.errorText, { color: colors.warning }]}>{modelsError}</Text>
              )}
              {(groupedModels.free.length > 0 ||
                groupedModels.paid.length > 0 ||
                groupedModels.unsuitable.length > 0) && (
                <>
                  <Text style={[styles.helperText, { color: colors.muted }]}>
                    {t("customProviderModelsListTitle")}
                  </Text>
                  {groupedModels.free.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={[styles.groupLabel, { color: colors.accent }]}>
                        {language === "en"
                          ? `Free (${groupedModels.free.length})`
                          : language === "uk"
                            ? `Безкоштовні (${groupedModels.free.length})`
                            : `Бесплатные (${groupedModels.free.length})`}
                      </Text>
                      <View style={styles.modelChips}>
                        {groupedModels.free.map((m) => {
                          const selected = config.modelId === m.id;
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[
                                styles.modelChip,
                                {
                                  borderColor: selected ? colors.accent : colors.line,
                                  backgroundColor: selected ? colors.accentDim : colors.inputBg,
                                },
                              ]}
                              onPress={() => {
                                onConfigChange({ modelId: m.id });
                                if (errors.modelId) setErrors({ ...errors, modelId: "" });
                              }}
                              activeOpacity={0.75}
                            >
                              <Text
                                style={[styles.modelChipText, { color: selected ? colors.accent : colors.ink }]}
                                numberOfLines={1}
                              >
                                {m.name || m.id}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {groupedModels.paid.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.groupLabel, { color: colors.inkBright }]}>
                        {language === "en"
                          ? `Paid (${groupedModels.paid.length})`
                          : language === "uk"
                            ? `Платні (${groupedModels.paid.length})`
                            : `Платные (${groupedModels.paid.length})`}
                      </Text>
                      <View style={styles.modelChips}>
                        {groupedModels.paid.map((m) => {
                          const selected = config.modelId === m.id;
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[
                                styles.modelChip,
                                {
                                  borderColor: selected ? colors.accent : colors.line,
                                  backgroundColor: selected ? colors.accentDim : colors.inputBg,
                                },
                              ]}
                              onPress={() => {
                                onConfigChange({ modelId: m.id });
                                if (errors.modelId) setErrors({ ...errors, modelId: "" });
                              }}
                              activeOpacity={0.75}
                            >
                              <Text
                                style={[styles.modelChipText, { color: selected ? colors.accent : colors.ink }]}
                                numberOfLines={1}
                              >
                                {m.name || m.id}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}
                  {groupedModels.unsuitable.length > 0 && (
                    <View style={{ marginTop: 10 }}>
                      <Text style={[styles.groupLabel, { color: colors.warning }]}>
                        {language === "en"
                          ? `Not for Termux / chat (${groupedModels.unsuitable.length})`
                          : language === "uk"
                            ? `Не для Termux / чату (${groupedModels.unsuitable.length})`
                            : `Не для Termux / чата (${groupedModels.unsuitable.length})`}
                      </Text>
                      <View style={styles.modelChips}>
                        {groupedModels.unsuitable.map((m) => (
                          <View
                            key={m.id}
                            style={[
                              styles.modelChip,
                              { borderColor: colors.line, backgroundColor: colors.inputBg, opacity: 0.55 },
                            ]}
                          >
                            <Text style={[styles.modelChipText, { color: colors.muted }]} numberOfLines={1}>
                              {m.name || m.id}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </>
              )}
            </View>

            <View style={styles.section}>
              <Text style={[styles.label, { color: colors.inkBright }]}>
                {t("apiKeyLabel")}
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
                  value={config.apiKey}
                  onChangeText={(value) => { onConfigChange({ apiKey: value }); setKeyCheckResult(null); }}
                  secureTextEntry={!showKey}
                  editable={!isLoading}
                  autoCapitalize="none"
                  autoCorrect={false}
                  autoComplete="off"
                  spellCheck={false}
                />
                <TouchableOpacity
                  onPress={() => setShowKey((v) => !v)}
                  style={styles.eyeButton}
                  disabled={isLoading}
                  accessibilityRole="button"
                  accessibilityLabel={showKey ? t("hide") : t("show")}
                >
                  <Ionicons name={showKey ? "eye" : "eye-off"} size={21} color={colors.muted} />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={[
                  styles.fetchButton,
                  { borderColor: colors.accent, backgroundColor: colors.accentDim, opacity: checkingKey ? 0.7 : 1, marginTop: 8 },
                ]}
                onPress={handleCheckKey}
                disabled={checkingKey || isLoading}
                activeOpacity={0.8}
              >
                {checkingKey ? (
                  <ActivityIndicator color={colors.accent} size="small" />
                ) : (
                  <Ionicons name="checkmark-circle-outline" size={16} color={colors.accent} />
                )}
                <Text style={[styles.fetchButtonText, { color: colors.accent }]}>
                  {checkingKey ? t("checkingApiKey") : t("checkApiKey")}
                </Text>
              </TouchableOpacity>
              {keyCheckResult && (
                <Text style={[styles.helperText, { color: keyCheckResult.valid ? colors.success : colors.warning }]}>
                  {keyCheckResult.message}
                </Text>
              )}
            </View>

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
                  {t("customProviderWarningTitle")}
                </Text>
                <Text style={[styles.warningText, { color: colors.muted }]}>
                  {t("customProviderWarningText")}
                </Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.line }]}>
            <TouchableOpacity
              style={[styles.footerButton, styles.cancelButton, { borderColor: colors.line }]}
              onPress={onClose}
              disabled={isLoading}
              activeOpacity={0.75}
            >
              <Text style={[styles.footerText, { color: colors.muted }]}>{t("cancel")}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.footerButton,
                styles.saveButton,
                { backgroundColor: colors.accent, opacity: isLoading ? 0.55 : 1 },
              ]}
              onPress={handleSave}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator color={colors.background} size="small" />
              ) : (
                <Ionicons name="checkmark" size={18} color={colors.background} />
              )}
              <Text style={[styles.footerText, { color: colors.background }]}>{language === "en" ? "Save" : language === "uk" ? "Зберегти" : "Сохранить"}</Text>
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
  errorText: { fontSize: 12, lineHeight: 16, marginTop: 2 },
  helperText: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  fetchButton: {
    minHeight: 44,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  fetchButtonText: { fontSize: 13.5, fontWeight: "700" },
  groupLabel: { fontSize: 12, fontWeight: "700", marginBottom: 4, letterSpacing: 0.2 },
  modelChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  modelChip: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 11,
    maxWidth: "100%",
  },
  modelChipText: { fontSize: 12.5, fontWeight: "600" },
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
