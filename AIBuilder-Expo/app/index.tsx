import { useState, useRef, useCallback, useEffect } from "react";
import {
  View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet,
  Platform, Keyboard, Image, PermissionsAndroid, Linking, ScrollView, Dimensions,
} from "react-native";
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import { File } from "expo-file-system";
import { Ionicons } from "@expo/vector-icons";
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from "expo-speech-recognition";
import { useFocusEffect } from "expo-router";
import { useLLMContext } from "../components/LLMContext";
import { useLoggerContext } from "../components/LoggerContext";
import { useAppSettingsContext } from "../components/AppSettingsContext";
import { useLanguage } from "../components/LanguageContext";
import { errorMessage } from "../lib/error-utils";
import { useDialog } from "../components/DialogContext";
import { useTheme } from "../components/ThemeContext";
import { useTermuxContext } from "../components/TermuxContext";
import { useTermuxConsole } from "../components/TermuxConsoleContext";
import { TermuxConsolePanel } from "../components/TermuxConsolePanel";
import { FREE_OPENROUTER_MODELS } from "../lib/online-model";
import { ReadinessBar } from "../components/ReadinessBar";
import { ChatBubble } from "../components/ChatBubble";
import { ModelModeSwitch } from "../components/ModelModeSwitch";
import { saveTextAsFile } from "../lib/text-file";
import { isClearChatCommand } from "../lib/chat-commands";
import { analyzeProjectText, formatSecurityReport } from "../lib/security-scanner";
import { createCheckpoint } from "../lib/checkpoints";
import { AgentThinkingPanel } from "../components/AgentThinkingPanel";
import { BuildProgressPanel } from "../components/BuildProgressPanel";
import { ReverseProgressPanel } from "../components/ReverseProgressPanel";
import { UniversalAttachmentMenu } from "../components/UniversalAttachmentMenu";
import { CameraCaptureModal } from "../components/CameraCaptureModal";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  voicePlayback,
  DEFAULT_VOICE_SETTINGS,
  type VoiceSettings,
} from "../lib/voice-runtime";
import { classifyMultimodalTask } from "../lib/multimodal-router";
import { generateImageFromPrompt } from "../lib/media-generation";
import { parseAndExtractAttachmentContent, detectAttachmentType } from "../lib/file-parser-registry";
import type { ChatAttachment } from "../lib/multimodal-types";
import { transcribeAudioFile, resolveSttEndpoint } from "../lib/audio-transcribe";
import { inspectAttachmentLocally, isBroadAttachmentIntent } from "../lib/file-intake";

const PASTE_TO_FILE_THRESHOLD = 800;

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

type PendingAttachment =
  | { kind: "file"; uri: string; name: string; size?: number; mimeType?: string }
  | { kind: "image"; uri: string; name: string; source?: "GALLERY" | "CAMERA" }
  | { kind: "audio"; uri: string; name: string }
  | { kind: "video"; uri: string; name: string };

export default function ChatScreen() {
  const [input, setInput] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [cameraModalVisible, setCameraModalVisible] = useState(false);
  const [voiceSettings, setVoiceSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const voiceBaseTextRef = useRef("");
  const voiceTranscriptRef = useRef("");
  const autoSendTriggeredRef = useRef(false);
  const { logInfo, logError } = useLoggerContext();
  const {
    isLoading,
    isAgentRunningInOtherSession = false,
    isSessionAgentBusy = false,
    sessions,
    currentSession,
    currentSessionId,
    setCurrentSessionId,
    sendMessage,
    stopGeneration,
    analyzeImage,
    createNewChat,
    addMessageToCurrentSession,
    deleteMessage,
    clearCurrentChat,
  } = useLLMContext();
  const {
    mode,
    model,
    onlineModel,
    customProvider,
    openCode,
    deepSeekApiKey,
  } = useAppSettingsContext();
  const { t, language } = useLanguage();
  const { showDialog } = useDialog();
  const { colors } = useTheme();
  const { enabled: termuxEnabled, checking: termuxChecking, setEnabled: setTermuxEnabled, activity: termuxActivity } = useTermuxContext();
  const { visible: consoleVisible } = useTermuxConsole();
  const flatListRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      loadVoiceSettings().then(setVoiceSettings);
    }, [])
  );

  const voiceSettingsRef = useRef<VoiceSettings>(voiceSettings);
  useEffect(() => {
    voiceSettingsRef.current = voiceSettings;
  }, [voiceSettings]);

  const inputRef = useRef(input);
  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  const handleSendRef = useRef<((overrideText?: string) => Promise<void>) | null>(null);
  const attachmentActionRef = useRef<string | null>(null);

  const speechendTimerRef = useRef<NodeJS.Timeout | null>(null);

  useSpeechRecognitionEvent("start", () => {
    setIsListening(true);
    autoSendTriggeredRef.current = false;
    logInfo("Voice", "Распознавание речи запущено.");
  });
  useSpeechRecognitionEvent("audiostart", () => {
    logInfo("Voice", "Аудиопоток микрофона запущен.");
  });
  useSpeechRecognitionEvent("speechstart", () => {
    logInfo("Voice", "Обнаружена речь.");
    if (speechendTimerRef.current) {
      clearTimeout(speechendTimerRef.current);
      speechendTimerRef.current = null;
    }
  });
  useSpeechRecognitionEvent("speechend", () => {
    logInfo("Voice", "Речь завершена, ожидаю финальный результат.");
    if (speechendTimerRef.current) clearTimeout(speechendTimerRef.current);
    // Через 600 мс после завершения речи, если система сама не закрыла сессию, форсируем stop()
    speechendTimerRef.current = setTimeout(() => {
      try {
        ExpoSpeechRecognitionModule.stop();
      } catch {}
    }, 600);
  });
  useSpeechRecognitionEvent("soundstart", () => {
    logInfo("Voice", "Обнаружен звук с микрофона.");
  });
  useSpeechRecognitionEvent("soundend", () => {
    logInfo("Voice", "Звук с микрофона завершён.");
  });
  useSpeechRecognitionEvent("end", () => {
    setIsListening(false);
    if (speechendTimerRef.current) {
      clearTimeout(speechendTimerRef.current);
      speechendTimerRef.current = null;
    }
    logInfo("Voice", "Распознавание речи завершено.");

    const settingsNow = voiceSettingsRef.current;
    const textToSend = voiceTranscriptRef.current.trim() || inputRef.current.trim();
    const shouldAutoSend = settingsNow.autoSend || settingsNow.voiceConversationMode;

    if (shouldAutoSend && textToSend && !autoSendTriggeredRef.current) {
      autoSendTriggeredRef.current = true;
      logInfo("Voice", `Автоотправка распознанной речи: "${textToSend}"`);
      setInput("");
      if (handleSendRef.current) {
        handleSendRef.current(textToSend).finally(() => {
          autoSendTriggeredRef.current = false;
        });
      } else {
        autoSendTriggeredRef.current = false;
      }
    }
  });
  useSpeechRecognitionEvent("result", (event) => {
    const transcript = event.results?.[0]?.transcript?.trim() || "";
    if (!transcript) return;
    const base = voiceBaseTextRef.current.trim();
    const full = base ? `${base} ${transcript}` : transcript;
    voiceTranscriptRef.current = full;
    setInput(full);
    logInfo(
      "Voice",
      `${event.results?.[0]?.isFinal ? "Финал" : "Промежуточный"}: ${transcript}`
    );
  });
  useSpeechRecognitionEvent("error", (event) => {
    setIsListening(false);
    if (speechendTimerRef.current) {
      clearTimeout(speechendTimerRef.current);
      speechendTimerRef.current = null;
    }
    logError(
      "Voice",
      `Ошибка распознавания: ${event?.error || "unknown"}${event?.message ? ` — ${event.message}` : ""}`
    );
  });

  const keyboard = useAnimatedKeyboard();
  const inputWrapperAnimatedStyle = useAnimatedStyle(() => ({
    paddingBottom: Math.max(
      keyboard.height.value,
      Math.max(insets.bottom, Platform.OS === "android" ? 8 : 0)
    ),
  }));

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    });
  }, []);

  const handleLargeTextPaste = useCallback(async (text: string) => {
    setInput("");
    try {
      const attachment = await saveTextAsFile(text, "paste");
      logInfo("Chat", `${t("pasteSavedAsFile")} (${text.length} ${t("charsUnit")}) — ${attachment.name}`);
      addMessageToCurrentSession({
        id: makeId(),
        role: "user" as const,
        content: t("pasteSavedAsFile"),
        timestamp: Date.now(),
        attachment: { kind: "text-file", name: attachment.name, uri: attachment.uri, size: attachment.size },
      });
      const truncated = text.length > 6000 ? `${text.slice(0, 6000)}\n…` : text;
      const response = await sendMessage(
        t("pasteAnalyzePrompt", { name: attachment.name, content: truncated })
      );
      addMessageToCurrentSession({
        id: makeId(),
        role: "assistant" as const,
        content: response,
        timestamp: Date.now(),
      });
      scrollToEnd();
    } catch (err: unknown) {
      logError("Chat", `${t("errorPaste")} ${errorMessage(err)}`);
    }
  }, [addMessageToCurrentSession, sendMessage, logInfo, logError, t, scrollToEnd]);

  const handleChangeText = useCallback((text: string) => {
    const delta = text.length - input.length;
    if (delta > PASTE_TO_FILE_THRESHOLD) {
      handleLargeTextPaste(text);
      return;
    }
    setInput(text);
  }, [input, handleLargeTextPaste]);

  const handleRemoveAttachment = useCallback((index?: number) => {
    if (typeof index === "number") {
      setPendingAttachments((prev) => prev.filter((_, i) => i !== index));
    } else {
      setPendingAttachments([]);
    }
  }, []);

  const toggleVoiceInput = useCallback(async () => {
    logInfo("Voice", `Нажата кнопка микрофона. Состояние: ${isListening ? "активно" : "неактивно"}.`);

    try {
      if (isListening) {
        ExpoSpeechRecognitionModule.stop();
        logInfo("Voice", "Отправлена команда остановки распознавания.");
        return;
      }

      const available = ExpoSpeechRecognitionModule.isRecognitionAvailable();
      const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices?.() || [];
      const defaultService = ExpoSpeechRecognitionModule.getDefaultRecognitionService?.()?.packageName || "";
      logInfo(
        "Voice",
        `Проверка распознавания: доступно=${available ? "да" : "нет"}; сервисы=${services.join(", ") || "нет"}; основной=${defaultService || "не определён"}.`
      );

      if (!available) {
        setIsListening(false);
        const msg =
          language === "en"
            ? "System speech recognition is unavailable. Install/enable Google Speech Services and grant microphone access."
            : language === "uk"
              ? "Системне розпізнавання мови недоступне. Встановіть/увімкніть Google Speech Services і дайте доступ до мікрофона."
              : "Системное распознавание речи недоступно. Установите/включите Google Speech Services (Speech Recognition & Synthesis) и дайте доступ к микрофону.";
        logError("Voice", msg);
        showDialog(t("voiceInput"), msg, [{ text: "OK" }]);
        return;
      }

      // --- Надёжный запрос RECORD_AUDIO (Android 13+ / OEM) ---
      // 1) Читаем состояние через expo-speech-recognition
      // 2) Если не выдано — сначала PermissionsAndroid.request (на Android 13
      //    системный диалог иногда не появляется через один только expo API)
      // 3) Повторно синхронизируем через requestPermissionsAsync
      // 4) Если навсегда запрещено — предлагаем открыть настройки приложения
      let permission = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
      logInfo(
        "Voice",
        `Текущее разрешение микрофона: ${permission.status}; granted=${permission.granted}; canAskAgain=${permission.canAskAgain}.`
      );

      if (!permission.granted && Platform.OS === "android") {
        try {
          const already = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
          logInfo("Voice", `PermissionsAndroid.check(RECORD_AUDIO)=${already}`);
          if (!already) {
            logInfo("Voice", "Запрашиваю RECORD_AUDIO через PermissionsAndroid.request…");
            const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
              title: language === "en" ? "Microphone permission" : language === "uk" ? "Дозвіл на мікрофон" : "Разрешение на микрофон",
              message:
                language === "en"
                  ? "AI Builder needs the microphone for voice input."
                  : language === "uk"
                    ? "AI Builder потрібен мікрофон для голосового введення."
                    : "AI Builder нужен микрофон для голосового ввода.",
              buttonPositive: language === "en" ? "Allow" : language === "uk" ? "Дозволити" : "Разрешить",
              buttonNegative: language === "en" ? "Deny" : language === "uk" ? "Заборонити" : "Запретить",
              buttonNeutral: language === "en" ? "Ask later" : language === "uk" ? "Пізніше" : "Позже",
            });
            logInfo("Voice", `PermissionsAndroid.request result=${result}`);
          }
        } catch (e: unknown) {
          logInfo("Voice", `PermissionsAndroid fallback: ${errorMessage(e)}`);
        }
        // Синхронизируем статус в expo-модуле (может показать диалог, если ещё не было)
        try {
          permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
        } catch (e: unknown) {
          logInfo("Voice", `requestPermissionsAsync: ${errorMessage(e)}`);
          permission = await ExpoSpeechRecognitionModule.getMicrophonePermissionsAsync();
        }
        logInfo(
          "Voice",
          `После запроса: ${permission.status}; granted=${permission.granted}; canAskAgain=${permission.canAskAgain}.`
        );
      } else if (!permission.granted) {
        // iOS / прочее
        permission = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      }

      if (!permission.granted) {
        setIsListening(false);
        const permanent = permission.canAskAgain === false;
        const msg = permanent
          ? language === "en"
            ? "Microphone access is blocked. Open Android Settings → Apps → AI Builder → Permissions → Microphone and enable it."
            : language === "uk"
              ? "Доступ до мікрофона заблоковано. Відкрийте Налаштування Android → Застосунки → AI Builder → Дозволи → Мікрофон і увімкніть."
              : "Доступ к микрофону запрещён. Откройте настройки Android → Приложения → AI Builder → Разрешения → Микрофон и включите."
          : language === "en"
            ? "Microphone access was not granted. Allow the microphone for AI Builder and press the button again."
            : language === "uk"
              ? "Доступ до мікрофона не видано. Дозвольте мікрофон для AI Builder і натисніть кнопку ще раз."
              : "Доступ к микрофону не выдан. Разрешите микрофон для AI Builder и нажмите кнопку ещё раз.";
        logError("Voice", msg);
        const buttons: { text: string; onPress?: () => void }[] = [{ text: "OK" }];
        if (permanent || Platform.OS === "android") {
          buttons.unshift({
            text: language === "en" ? "Open settings" : language === "uk" ? "Налаштування" : "Настройки",
            onPress: () => {
              Linking.openSettings().catch(() => {});
            },
          });
        }
        showDialog(t("voiceInput"), msg, buttons);
        return;
      }

      voiceBaseTextRef.current = input.trim();
      voiceTranscriptRef.current = "";
      const lang = language === "ru" ? "ru-RU" : language === "uk" ? "uk-UA" : "en-US";
      const startOptions: {
        lang: string;
        interimResults: boolean;
        maxAlternatives: number;
        continuous: boolean;
        requiresOnDeviceRecognition: boolean;
        addsPunctuation: boolean;
        androidRecognitionServicePackage?: string;
      } = {
        lang,
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: false,
        addsPunctuation: true,
      };
      if (Platform.OS === "android" && defaultService) {
        startOptions.androidRecognitionServicePackage = defaultService;
      }

      logInfo("Voice", `Запускаю распознавание: ${lang}; service=${defaultService || "default"}.`);
      setIsListening(true);
      ExpoSpeechRecognitionModule.start(startOptions);
      logInfo("Voice", "Команда start() передана нативному SpeechRecognizer.");
    } catch (err: unknown) {
      setIsListening(false);
      const msg = `Сбой запуска голосового ввода: ${errorMessage(err)}`;
      logError("Voice", msg);
      showDialog(t("voiceInput"), msg, [
        { text: "OK" },
        {
          text: language === "en" ? "Open settings" : language === "uk" ? "Налаштування" : "Настройки",
          onPress: () => {
            Linking.openSettings().catch(() => {});
          },
        },
      ]);
    }
  }, [isListening, input, language, logInfo, logError, showDialog, t]);

  // Единая точка отправки: собирает то, что сейчас висит в поле ввода —
  // текст и/или прикреплённый файл/фото — в ОДНО сообщение пользователя,
  // добавляет его в чат и уже потом обращается к модели.

  const handleSend = useCallback(async (overrideText?: string) => {
    const rawText = typeof overrideText === "string" ? overrideText : input;
    const trimmed = rawText.trim();
    const attachment = pendingAttachments[0] || null;
    if (!trimmed && !attachment) return;
    // Only block this chat while ITS agent/request is busy — other chat may run Termux agent
    if (isSessionAgentBusy) return;
    Keyboard.dismiss();
    if (!attachment && isClearChatCommand(trimmed)) {
      setInput("");
      setPendingAttachments([]);
      voiceTranscriptRef.current = "";
      voiceBaseTextRef.current = "";
      clearCurrentChat();
      return;
    }

    // Local-first file intake: broad requests must be resolved locally before
    // any model call. The selected action is then fed back through the same
    // attachment workflow, so the attachment is never lost and no new chat is created.
    if (attachment && isBroadAttachmentIntent(trimmed) && !attachmentActionRef.current) {
      const chatAttachment: ChatAttachment = {
        id: makeId(),
        uri: attachment.uri,
        displayName: attachment.name,
        mimeType: ("mimeType" in attachment && attachment.mimeType) || "application/octet-stream",
        sizeBytes: ("size" in attachment && attachment.size != null) ? attachment.size : 0,
        extension: attachment.name.split(".").pop() || "",
        attachmentType: detectAttachmentType(attachment.name, ("mimeType" in attachment ? attachment.mimeType : undefined)),
        localState: "PROCESSING",
        source: "FILE",
      };
      try {
        const analysis = await inspectAttachmentLocally(chatAttachment);
        if (analysis.analysisState === "ERROR") {
          logError("FileIntake", `Безопасная локальная проверка остановлена: ${analysis.error || "unknown"}`);
          showDialog(
            "Файл не прошёл локальную проверку",
            `${attachment.name}\n\n${analysis.error || "Формат/структура файла не подтверждены."}`,
            [{ text: t("cancel"), style: "cancel" }]
          );
          return;
        }
        const actions = analysis.availableActions.slice(0, 7);
        if (actions.length > 1) {
          logInfo("FileIntake", `ACTION_PICKER open file=${attachment.name} type=${analysis.detectedType} actions=${actions.map(a => a.id).join(",")}`);
          showDialog(
            `Что сделать с «${attachment.name}»?`,
            `${analysis.detectedType} · ${(analysis.size / 1024).toFixed(1)} КБ${analysis.archive ? ` · ${analysis.archive.entryCount} файлов` : ""}`,
            [
              ...actions.map((action) => ({
                text: action.label,
                onPress: () => {
                  attachmentActionRef.current = action.id;
                  logInfo("FileIntake", `ACTION_SELECTED file=${attachment.name} action=${action.id}`);
                  setTimeout(() => {
                    const send = handleSendRef.current;
                    if (send) void send(action.prompt);
                  }, 0);
                },
              })),
              { text: t("cancel"), style: "cancel", onPress: () => logInfo("FileIntake", `ACTION_PICKER cancelled file=${attachment.name}`) },
            ]
          );
          return;
        }
      } catch (e: unknown) {
        logError("FileIntake", `Local pre-analysis exception: ${errorMessage(e)}`);
        return;
      }
    }

    // Consume the action marker only after the local-first picker has been bypassed.
    attachmentActionRef.current = null;
    setInput("");
    setPendingAttachments([]);
    voiceTranscriptRef.current = "";
    voiceBaseTextRef.current = "";

    if (attachment?.kind === "image") {
      if (mode === "online") {
        const mid = onlineModel?.id || "";
        const meta = FREE_OPENROUTER_MODELS.find((m) => m.id === mid || mid.includes(m.id));
        if (meta && !meta.vision) {
          showDialog(t("visionWarnTitle"), t("visionWarnBody", { name: meta.name }));
        }
      }
      logInfo("Chat", `${t("imageSelected")} ${attachment.name}`);
      addMessageToCurrentSession({
        id: makeId(),
        role: "user" as const,
        content: trimmed,
        timestamp: Date.now(),
        attachment: {
          kind: "image",
          name: attachment.name,
          uri: attachment.uri,
          source: attachment.source || "GALLERY",
        },
      });
      scrollToEnd();
      try {
        const prompt = trimmed || t("imageAnalyzePrompt");
        const response = await analyzeImage(attachment.uri, prompt);
        const assistantMsg = {
          id: makeId(),
          role: "assistant" as const,
          content: response,
          timestamp: Date.now(),
        };
        addMessageToCurrentSession(assistantMsg);
        logInfo("Chat", t("imageAnalysisDone"));
        if (voiceSettings.autoSpeakResponses || voiceSettings.voiceConversationMode) {
          voicePlayback.speakText(assistantMsg.id, response, language, {
            speed: voiceSettings.ttsSpeed,
            readCodeBlocks: voiceSettings.readCodeBlocks,
          }).catch(() => {});
        }
        scrollToEnd();
      } catch (err: unknown) {
        logError("Chat", `${t("errorPickImage")} ${errorMessage(err)}`);
      }
      return;
    }

    if (attachment?.kind === "file" || attachment?.kind === "audio" || attachment?.kind === "video") {
      logInfo("Chat", `${t("fileSelected")} ${attachment.name}`);
      const attType = detectAttachmentType(attachment.name, ("mimeType" in attachment ? attachment.mimeType : undefined));
      const chatAttachment: ChatAttachment = {
        id: makeId(),
        uri: attachment.uri,
        displayName: attachment.name,
        mimeType: ("mimeType" in attachment && attachment.mimeType) || "application/octet-stream",
        sizeBytes: ("size" in attachment && attachment.size != null) ? attachment.size : 0,
        extension: attachment.name.split(".").pop() || "",
        attachmentType: attType,
        localState: "READY",
        source: "FILE",
      };

      const messageKind =
        attType === "AUDIO"
          ? ("audio" as const)
          : attType === "VIDEO"
          ? ("video" as const)
          : attType === "ARCHIVE"
          ? ("archive" as const)
          : ("document" as const);

      addMessageToCurrentSession({
        id: makeId(),
        role: "user" as const,
        content: trimmed,
        timestamp: Date.now(),
        attachment: {
          kind: messageKind,
          name: attachment.name,
          uri: attachment.uri,
          size: ("size" in attachment && attachment.size) || 0,
        },
      });
      scrollToEnd();

      try {
        // --- АУДИО: расшифровка (STT) → текст в чат ---
        if (attType === "AUDIO" || attachment.kind === "audio") {
          if (mode === "local") {
            const msg =
              language === "en"
                ? "Offline mode cannot transcribe audio files. Switch to Online / Custom provider (with Whisper support) or use the microphone button for live speech recognition."
                : language === "uk"
                  ? "Офлайн-режим не розпізнає аудіофайли. Увімкніть Online / Custom (з підтримкою Whisper) або використовуйте мікрофон для живого розпізнавання."
                  : "Офлайн-режим не распознаёт аудиофайлы. Включите Online / Custom (с поддержкой Whisper) или используйте микрофон для живого распознавания.";
            addMessageToCurrentSession({
              id: makeId(),
              role: "assistant" as const,
              content: msg,
              timestamp: Date.now(),
            });
            scrollToEnd();
            return;
          }

          const stt = resolveSttEndpoint(mode, {
            onlineModel,
            customProvider,
            openCode,
            deepSeekApiKey,
          });

          if (!stt) {
            const msg =
              language === "en"
                ? "No API key for speech-to-text. Set a key in Settings (OpenRouter / Custom / OpenCode)."
                : language === "uk"
                  ? "Немає API-ключа для розпізнавання мови. Вкажіть ключ у Налаштуваннях (OpenRouter / Custom / OpenCode)."
                  : "Нет API-ключа для распознавания речи. Укажите ключ в Настройках (OpenRouter / Custom / OpenCode).";
            addMessageToCurrentSession({
              id: makeId(),
              role: "assistant" as const,
              content: msg,
              timestamp: Date.now(),
            });
            scrollToEnd();
            return;
          }

          logInfo("Chat", `STT: расшифровка ${attachment.name}…`);
          let transcript = "";
          try {
            transcript = await transcribeAudioFile({
              uri: attachment.uri,
              fileName: attachment.name,
              apiKey: stt.apiKey,
              baseUrl: stt.baseUrl,
              language: language === "uk" ? "uk" : language === "en" ? "en" : "ru",
              extraHeaders: stt.extraHeaders,
            });
          } catch (sttErr: unknown) {
            const raw = sttErr instanceof Error ? sttErr.message : String(sttErr);
            logError("Chat", `STT failed: ${raw}`);
            const hint =
              language === "en"
                ? `Could not transcribe audio (${raw.slice(0, 180)}).\n\nTips:\n• Free tier may not include Whisper — try Groq/OpenAI base URL in Custom Provider, or a paid key.\n• Use the microphone button for live speech (works offline with Google Speech).`
                : language === "uk"
                  ? `Не вдалося розпізнати аудіо (${raw.slice(0, 180)}).\n\nПоради:\n• Free-тариф може не мати Whisper — спробуйте Groq/OpenAI у Custom Provider або платний ключ.\n• Мікрофон (живе розпізнавання) працює через Google Speech.`
                  : `Не удалось распознать аудио (${raw.slice(0, 180)}).\n\nСоветы:\n• Free-тариф может не включать Whisper — попробуйте Groq/OpenAI в Custom Provider или платный ключ.\n• Кнопка микрофона (живое распознавание) работает через Google Speech.`;
            addMessageToCurrentSession({
              id: makeId(),
              role: "assistant" as const,
              content: hint,
              timestamp: Date.now(),
            });
            scrollToEnd();
            return;
          }

          const prompt = trimmed
            ? `${trimmed}\n\n[Расшифровка аудио «${attachment.name}»]:\n${transcript}`
            : language === "en"
              ? `The user attached an audio file «${attachment.name}». Transcript:\n\n${transcript}\n\nRespond to the content of this audio.`
              : language === "uk"
                ? `Користувач прикріпив аудіо «${attachment.name}». Розшифровка:\n\n${transcript}\n\nВідповіть за змістом цього аудіо.`
                : `Пользователь прикрепил аудио «${attachment.name}». Расшифровка:\n\n${transcript}\n\nОтветь по содержанию этого аудио.`;

          const response = await sendMessage(prompt);
          const assistantMsg = {
            id: makeId(),
            role: "assistant" as const,
            content: response,
            timestamp: Date.now(),
          };
          addMessageToCurrentSession(assistantMsg);
          if (voiceSettings.autoSpeakResponses || voiceSettings.voiceConversationMode) {
            voicePlayback.speakText(assistantMsg.id, response, language, {
              speed: voiceSettings.ttsSpeed,
              readCodeBlocks: voiceSettings.readCodeBlocks,
            }).catch(() => {});
          }
          scrollToEnd();
          return;
        }

        // --- ВИДЕО: без нативного video-input у free — честное сообщение + текст пользователя ---
        if (attType === "VIDEO" || attachment.kind === "video") {
          const note =
            language === "en"
              ? `[Video file «${attachment.name}» attached. Full video understanding is limited on free models — describe the issue in text or send a screenshot/frame for best results.]`
              : language === "uk"
                ? `[Відеофайл «${attachment.name}» прикріплено. Повний розбір відео на free-моделях обмежений — опишіть проблему текстом або надішліть скрін/кадр.]`
                : `[Видеофайл «${attachment.name}» прикреплён. Полный разбор видео на free-моделях ограничен — опишите проблему текстом или пришлите скрин/кадр.]`;
          const prompt = trimmed ? `${trimmed}\n\n${note}` : note;
          const response = await sendMessage(prompt);
          const assistantMsg = {
            id: makeId(),
            role: "assistant" as const,
            content: response,
            timestamp: Date.now(),
          };
          addMessageToCurrentSession(assistantMsg);
          if (voiceSettings.autoSpeakResponses || voiceSettings.voiceConversationMode) {
            voicePlayback.speakText(assistantMsg.id, response, language, {
              speed: voiceSettings.ttsSpeed,
              readCodeBlocks: voiceSettings.readCodeBlocks,
            }).catch(() => {});
          }
          scrollToEnd();
          return;
        }

        // --- ДОКУМЕНТЫ / АРХИВЫ / ПРОЧИЕ ФАЙЛЫ: извлечение текста (online + offline) ---
        const parsed = await parseAndExtractAttachmentContent(chatAttachment);
        const scanIssues = analyzeProjectText(parsed.text);
        if (scanIssues.length > 0) {
          addMessageToCurrentSession({
            id: makeId(),
            role: "assistant" as const,
            content: formatSecurityReport(scanIssues),
            timestamp: Date.now(),
          });
          logInfo("Security", `Static scan: ${scanIssues.length} issue(s) in ${attachment.name}`);
        }

        const prompt = trimmed
          ? `${trimmed}\n\n[Содержимое файла ${attachment.name}]:\n${parsed.text}`
          : `Проанализируй прикреплённый файл ${attachment.name}:\n\n${parsed.text}`;

        const response = await sendMessage(prompt);
        const assistantMsg = {
          id: makeId(),
          role: "assistant" as const,
          content: response,
          timestamp: Date.now(),
        };
        addMessageToCurrentSession(assistantMsg);
        if (voiceSettings.autoSpeakResponses || voiceSettings.voiceConversationMode) {
          voicePlayback.speakText(assistantMsg.id, response, language, {
            speed: voiceSettings.ttsSpeed,
            readCodeBlocks: voiceSettings.readCodeBlocks,
          }).catch(() => {});
        }
        scrollToEnd();
      } catch (readErr: unknown) {
        logError("Chat", `${t("errorReadFile")} ${errorMessage(readErr)}`);
      }
      return;
    }

    // Проверка генерации изображений без вложений: "нарисуй...", "создай картинку..."
    const taskClass = classifyMultimodalTask(trimmed, []);
    if (!attachment && taskClass.taskType === "IMAGE_GENERATION") {
      logInfo("Chat", `Мультимодальная генерация изображения: ${trimmed}`);
      const userMsg = {
        id: makeId(),
        role: "user" as const,
        content: trimmed,
        timestamp: Date.now(),
      };
      addMessageToCurrentSession(userMsg);
      scrollToEnd();
      try {
        const generated = await generateImageFromPrompt(trimmed);
        const assistantMsg = {
          id: makeId(),
          role: "assistant" as const,
          content:
            language === "en"
              ? "Here is the generated image:"
              : language === "uk"
              ? "Ось згенероване зображення:"
              : "Вот сгенерированное изображение:",
          timestamp: Date.now(),
          attachment: {
            kind: "media" as const,
            name: generated.displayName,
            uri: generated.uri,
            source: "GENERATED" as const,
          },
        };
        addMessageToCurrentSession(assistantMsg);
        scrollToEnd();
      } catch (genErr: unknown) {
        logError("Chat", `Ошибка генерации изображения: ${errorMessage(genErr)}`);
      }
      return;
    }

    // Обычное текстовое сообщение, без вложений.
    logInfo("Chat", `${t("logSendMessage")} ${trimmed.slice(0, 50)}...`);
    const userMsg = {
      id: makeId(),
      role: "user" as const,
      content: trimmed,
      timestamp: Date.now(),
    };
    addMessageToCurrentSession(userMsg);
    scrollToEnd();
    try {
      const response = await sendMessage(userMsg.content);
      const isModelError = response.startsWith(`${t("modelError")}:`);
      if (isModelError) {
        // Provider failures are diagnostics/status, not successful assistant replies.
        // Keep the chat state clean so a failed request cannot create a false checkpoint.
        logError("Chat", response);
        showDialog(t("modelError"), response, [{ text: "OK" }]);
        scrollToEnd();
        return;
      }
      const assistantMsg = {
        id: makeId(),
        role: "assistant" as const,
        content: response,
        timestamp: Date.now(),
      };
      addMessageToCurrentSession(assistantMsg);
      logInfo("Chat", t("logAiResponse"));
      if (voiceSettings.autoSpeakResponses || voiceSettings.voiceConversationMode) {
        voicePlayback.speakText(assistantMsg.id, response, language, {
          speed: voiceSettings.ttsSpeed,
          readCodeBlocks: voiceSettings.readCodeBlocks,
        }).catch(() => {});
      }
      // Не создаём успешный checkpoint после provider/model error.
      if (!isModelError) {
        createCheckpoint(
          currentSession?.id || "default",
          t("checkpointAfterReply"),
          [...currentSession.messages, userMsg, assistantMsg].map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
          }))
        ).catch(() => {});
      } else {
        logError("Chat", "Checkpoint skipped because model call failed");
      }
      scrollToEnd();
    } catch (err: unknown) {
      logError("Chat", `${t("errorSend")} ${errorMessage(err)}`);
    }
  }, [input, pendingAttachments, isSessionAgentBusy, mode, onlineModel, customProvider, openCode, deepSeekApiKey, sendMessage, analyzeImage, addMessageToCurrentSession, currentSession, logInfo, logError, t, scrollToEnd, clearCurrentChat, voiceSettings, language, showDialog]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // Универсальный выбор любого файла (PDF, DOCX, XLSX, код, APK, ZIP)
  const handleAttachFile = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        logInfo("Chat", `${t("fileSelected")} ${file.name}`);
        const attachment: PendingAttachment = {
          kind: "file",
          uri: file.uri,
          name: file.name,
          size: file.size,
          mimeType: file.mimeType,
        };
        setPendingAttachments((prev) => [...prev, attachment].slice(0, 5));
      } else {
        logInfo("Chat", t("filePickCancelled"));
      }
    } catch (err: unknown) {
      logError("Chat", `${t("errorPickFile")} ${errorMessage(err)}`);
    }
  }, [logInfo, logError, t]);

  const handleAttachImage = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "images",
        allowsEditing: false,
        quality: 0.85,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const image = result.assets[0];
        const fileName = image.uri.split("/").pop() || "image";
        logInfo("Chat", `${t("imageSelected")} ${fileName}`);
        const attachment: PendingAttachment = { kind: "image", uri: image.uri, name: fileName, source: "GALLERY" };
        setPendingAttachments((prev) => [...prev, attachment].slice(0, 5));
      } else {
        logInfo("Chat", t("imagePickCancelled"));
      }
    } catch (err: unknown) {
      logError("Chat", `${t("errorPickImage")} ${errorMessage(err)}`);
    }
  }, [logInfo, logError, t]);

  const handleAttachVideo = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: "videos",
        allowsEditing: false,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const video = result.assets[0];
        const fileName = video.uri.split("/").pop() || "video.mp4";
        logInfo("Chat", `Видео выбрано: ${fileName}`);
        const attachment: PendingAttachment = { kind: "video", uri: video.uri, name: fileName };
        setPendingAttachments((prev) => [...prev, attachment].slice(0, 5));
      }
    } catch (err: unknown) {
      logError("Chat", `Ошибка выбора видео: ${errorMessage(err)}`);
    }
  }, [logInfo, logError]);

  const handleAttachAudio = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "audio/*",
        copyToCacheDirectory: true,
      });

      if (result.canceled === false && result.assets && result.assets.length > 0) {
        const audio = result.assets[0];
        logInfo("Chat", `Аудио выбрано: ${audio.name}`);
        const attachment: PendingAttachment = { kind: "audio", uri: audio.uri, name: audio.name };
        setPendingAttachments((prev) => [...prev, attachment].slice(0, 5));
      }
    } catch (err: unknown) {
      logError("Chat", `Ошибка выбора аудио: ${errorMessage(err)}`);
    }
  }, [logInfo, logError]);

  // Lock send only in the chat that owns the running agent; other chats stay usable.
  const canSend = !isSessionAgentBusy && (!!input.trim() || pendingAttachments.length > 0);
  const canStop = isSessionAgentBusy;

  // ВАЖНО (фикс "бесконечно растягивающегося пустого поля" при длинных
  // ответах ИИ): раньше renderItem был инлайн-функцией, создаваемой заново
  // при КАЖДОМ рендере ChatScreen — а ChatScreen перерисовывался на каждое
  // нажатие клавиши в поле ввода (setInput). Новая ссылка на renderItem
  // заставляла FlatList перерисовывать ВСЕ сообщения в чате, включая
  // подсветку синтаксиса во всех блоках кода, при каждом нажатии клавиши.
  // Чем длиннее ответ (больше кода/текста) — тем тяжелее становился этот
  // пересчёт на каждый символ, и UI начинал "зависать": список визуально
  // дёргался/растягивался пустым пространством, а поле ввода переставало
  // успевать реагировать на ввод. useCallback с стабильными зависимостями
  // решает это — renderItem не пересоздаётся на каждое нажатие клавиши.
  const renderItem = useCallback(
    ({ item }: { item: (typeof currentSession.messages)[number] }) => (
      <ChatBubble message={item} onDelete={deleteMessage} />
    ),
    [deleteMessage]
  );

  return (
    <View style={[styles.outer, { backgroundColor: colors.background }]}>
      <View style={[styles.topBar, { backgroundColor: colors.headerBg, borderBottomColor: colors.line }]}>
        <ModelModeSwitch
          enabled={termuxEnabled}
          checking={termuxChecking}
          onSetEnabled={setTermuxEnabled}
        />
        <TouchableOpacity style={[styles.newChatButtonTop, { backgroundColor: colors.accentDim, borderColor: colors.accent }]} onPress={() => {
          logInfo("Chat", t("logNewChat"));
          createNewChat();
        }}>
          <Text style={[styles.newChatTextTop, { color: colors.accent }]}>{t("newChat")}</Text>
        </TouchableOpacity>
      </View>

      {/* Быстрое переключение чатов на главном экране */}
      {sessions && sessions.length > 0 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ maxHeight: 44, flexGrow: 0 }}
          contentContainerStyle={{ paddingHorizontal: 10, paddingVertical: 6, gap: 8, alignItems: "center" }}
        >
          {sessions.slice(0, 12).map((sess) => {
            const active = sess.id === currentSessionId;
            const title = (sess.title || "Чат").slice(0, 22);
            return (
              <TouchableOpacity
                key={sess.id}
                onPress={() => setCurrentSessionId(sess.id)}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 7,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: active ? colors.accent : colors.line,
                  backgroundColor: active ? colors.accentDim : colors.surface,
                  maxWidth: 160,
                }}
              >
                <Text numberOfLines={1} style={{ color: active ? colors.accent : colors.muted, fontSize: 12, fontWeight: active ? "700" : "500" }}>
                  {title}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ── Ordered workspace: Console → Progress → Chat → Thinking → (Input below) ── */}
      {consoleVisible ? (
        <View
          style={{
            height: Math.round(Dimensions.get("window").height * 0.34),
            minHeight: 180,
            maxHeight: 320,
            flexShrink: 0,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.line,
          }}
        >
          <TermuxConsolePanel />
        </View>
      ) : null}

      <View style={[styles.chatArea, { flex: 1, minHeight: 120 }]}>
        {!consoleVisible ? <ReadinessBar /> : null}
        {isAgentRunningInOtherSession ? (
          <View style={{ marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: "#F59E0B", backgroundColor: "rgba(245,158,11,0.12)" }}>
            <Text style={{ color: "#F59E0B", fontSize: 11, fontWeight: "700" }}>
              {language === "en"
                ? "Termux agent is busy in another chat — replies here are model-only. Termux stays ON so that build is not stopped."
                : language === "uk"
                  ? "Termux-агент зайнятий в іншому чаті — тут відповіді лише від моделі. Termux лишається увімкненим, збірку не зупиняємо."
                  : "Termux-агент занят в другом чате — здесь ответы только от модели. Termux остаётся включённым, сборку не прерываем."}
            </Text>
          </View>
        ) : null}

        {!isAgentRunningInOtherSession && !consoleVisible ? (
          <View style={{ flexShrink: 0 }}>
            <BuildProgressPanel compact={false} />
            <ReverseProgressPanel />
          </View>
        ) : null}

        {!!termuxActivity &&
          (!termuxActivity.isBuild ||
            !(termuxActivity.stages && termuxActivity.stages.length > 0)) &&
          (!!termuxActivity.command ||
            !!termuxActivity.title ||
            !!termuxActivity.stage) && (
          <View style={[styles.activityBar, { backgroundColor: colors.surface, borderColor: colors.line }]}>
            <Text style={{ color: colors.info, fontSize: 11, fontWeight: "700" }}>
              {termuxActivity.isBuild
                ? (termuxActivity.title || "Build")
                : `Termux ${termuxActivity.step}/${termuxActivity.maxSteps}`}
            </Text>
            {!!termuxActivity.stage && (
              <Text style={{ color: colors.textSecondary, fontSize: 10 }} numberOfLines={1}>
                {termuxActivity.stage}
              </Text>
            )}
            {!!termuxActivity.command && (
              <Text style={{ color: colors.textSecondary, fontSize: 10 }} numberOfLines={2}>
                {termuxActivity.command}
              </Text>
            )}
          </View>
        )}

        <View style={{ flex: 1, minHeight: 80 }}>
<FlatList
        ref={flatListRef}
        data={currentSession?.messages || []}
        keyExtractor={(item, index) => item?.id || `msg-${index}`}
        contentContainerStyle={styles.messagesList}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        // ВАЖНО (фикс "бесконечно растягивающегося пустого поля" ПОСЛЕ
        // очень длинного ответа ИИ — жалоба пользователя со скриншотом):
        // на Android FlatList по умолчанию включает removeClippedSubviews,
        // который "отклеивает" (unmount) нативные view элементов списка,
        // как только они уходят за пределы окна рендера (windowSize), чтобы
        // экономить память. Для ОБЫЧНЫХ (невысоких) элементов это незаметно,
        // но один пузырёк чата с очень длинным ответом (много текста и/или
        // несколько блоков кода) может быть в разы выше экрана — и именно
        // на таких высоких элементах recycling на Android нередко неверно
        // пересчитывает высоту при повторном приклеивании, оставляя после
        // себя растущую пустую область внизу списка вместо реального
        // содержимого. removeClippedSubviews={false} отключает этот
        // recycling целиком: для чата с разумным количеством сообщений
        // (десятки-сотни, не тысячи) это не создаёт проблем с памятью, зато
        // полностью убирает первопричину бага. windowSize/initialNumToRender/
        // maxToRenderPerBatch увеличены, чтобы соседние с текущим экраном
        // сообщения тоже держались отрисованными и не "мигали" при скролле.
        removeClippedSubviews={false}
        windowSize={21}
        initialNumToRender={20}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={50}
        // maintainVisibleContentPosition убран: он нужен спискам, у которых
        // контент добавляется СВЕРХУ (например, инвертированные чаты). Здесь
        // сообщения всегда добавляются СНИЗУ, а этот проп в паре с
        // onLayout=scrollToEnd (см. ниже, тоже убран) вызывал на Android
        // известный баг — список после длинного ответа "не мог" правильно
        // посчитать конец контента и оставлял снизу растущую пустую область.
        // onContentSizeChange (единственный источник автоскролла ниже)
        // срабатывает именно тогда, когда реально меняется контент, и этого
        // достаточно, чтобы прокручивать чат к последнему сообщению.
        onContentSizeChange={scrollToEnd}
        renderItem={renderItem}
        style={styles.list}
        scrollEnabled={true}
        nestedScrollEnabled
      />
        </View>

        {!consoleVisible ? (
        <View style={{ flexShrink: 0 }}>
          <AgentThinkingPanel
            active={!!isSessionAgentBusy || (!!termuxActivity && !isAgentRunningInOtherSession)}
            compact={false}
          />
        </View>
        ) : null}
      </View>

      <Animated.View style={[styles.inputWrapper, inputWrapperAnimatedStyle, { backgroundColor: colors.background, borderTopColor: colors.line }]}>
        {/* Voice conversation mode banner */}
        {voiceSettings.voiceConversationMode && (
          <View style={[styles.voiceModeBanner, { backgroundColor: "rgba(45, 212, 191, 0.12)", borderColor: colors.accent }]}>
            <Ionicons name="mic-circle" size={16} color={colors.accent} />
            <Text style={[styles.voiceModeText, { color: colors.accent }]}>
              {language === "en" ? "Voice conversation mode active" : language === "uk" ? "Голосовий режим активний" : "Голосовой режим активен"}
            </Text>
          </View>
        )}

        {/* Listening banner */}
        {isListening && (
          <View style={styles.listeningBanner}>
            <View style={styles.listeningDot} />
            <Text style={styles.listeningText}>
              {language === "en" ? "Listening... Speak now" : language === "uk" ? "Слухаю... Говоріть" : "Слушаю... Говорите"}
            </Text>
          </View>
        )}

        {/* Horizontal scrollable pending attachments list */}
        {pendingAttachments.length > 0 && (
          <View style={styles.attachmentPreviewRow}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentPreviewScroll}>
              {pendingAttachments.map((att, idx) => (
                <View key={`${att.name}-${idx}`} style={[styles.attachmentPreviewChip, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
                  {att.kind === "image" ? (
                    <Image source={{ uri: att.uri }} style={styles.attachmentPreviewThumb} />
                  ) : (
                    <View style={styles.attachmentPreviewIconWrap}>
                      <Text style={styles.attachmentPreviewIcon}>
                        {att.kind === "audio" ? "🎵" : att.kind === "video" ? "🎥" : "📄"}
                      </Text>
                    </View>
                  )}
                  <Text style={[styles.attachmentPreviewName, { color: colors.inkBright }]} numberOfLines={1}>
                    {att.name}
                  </Text>
                  <TouchableOpacity
                    style={styles.attachmentPreviewRemove}
                    onPress={() => handleRemoveAttachment(idx)}
                    accessibilityLabel={t("removeAttachment")}
                  >
                    <Ionicons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        <View style={[styles.inputContainer, { backgroundColor: colors.surfaceRaised, borderColor: colors.line }]}>
          {/* Unified [ + ] Universal Attachment Menu */}
          <TouchableOpacity
            style={[styles.iconButton, styles.plusButton, { backgroundColor: colors.accentDim }]}
            onPress={() => setAttachmentMenuVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="Universal attachment menu"
          >
            <Ionicons name="add" size={22} color={colors.accent} />
          </TouchableOpacity>

          <TextInput
            style={[styles.input, { color: colors.inkBright }]}
            value={input}
            onChangeText={handleChangeText}
            placeholder={t("writeRequest")}
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={20000}
          />

          <TouchableOpacity
            style={[styles.iconButton, styles.voiceButton, isListening && { backgroundColor: "rgba(239, 68, 68, 0.16)" }]}
            onPress={toggleVoiceInput}
            activeOpacity={0.65}
            accessibilityRole="button"
            accessibilityLabel={isListening ? t("stopGeneration") : t("voiceInput")}
            testID="chat-voice-button"
          >
            <Ionicons name={isListening ? "mic" : "mic-outline"} size={21} color={isListening ? "#EF4444" : colors.inkBright} />
          </TouchableOpacity>

          {canStop ? (
            <TouchableOpacity style={[styles.actionButton, styles.stopActionButton]} onPress={stopGeneration} accessibilityLabel={t("stopGeneration")}>
              <Ionicons name="stop" size={17} color="#fff" />
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: colors.accent }, !canSend && styles.actionButtonDisabled]} onPress={() => handleSend()} disabled={!canSend} accessibilityLabel={t("send")}>
              <Ionicons name="arrow-up" size={19} color="#06131A" />
            </TouchableOpacity>
          )}
        </View>
      </Animated.View>

      <UniversalAttachmentMenu
        visible={attachmentMenuVisible}
        onClose={() => setAttachmentMenuVisible(false)}
        onSelectCamera={() => setCameraModalVisible(true)}
        onSelectGallery={handleAttachImage}
        onSelectVideo={handleAttachVideo}
        onSelectAudio={handleAttachAudio}
        onSelectDocument={handleAttachFile}
      />

      <CameraCaptureModal
        visible={cameraModalVisible}
        onClose={() => setCameraModalVisible(false)}
        onPhotoAccepted={(attachment) => {
          const pending: PendingAttachment = {
            kind: "image",
            uri: attachment.uri,
            name: attachment.displayName || attachment.uri.split("/").pop() || "camera.jpg",
            source: "CAMERA",
          };
          setPendingAttachments((prev) => [...prev, pending].slice(0, 5));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  chatArea: { flex: 1 },
  chatSplitArea: { flex: 1 },
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "transparent",
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  list: { flex: 1 },
  listNested: { flexGrow: 0 },
  messagesList: { padding: 16, paddingBottom: 8 },
  typingIndicator: { paddingHorizontal: 16, paddingVertical: 6 },
  typingText: { color: "#0D9488", fontSize: 12 },
  newChatButtonTop: {
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: "rgba(45, 212, 191, 0.2)",
  },
  newChatTextTop: {
    color: "#0D9488",
    fontSize: 12,
    fontWeight: "600",
  },
  quickActionsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  quickChip: {
    backgroundColor: "#1A2236",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243044",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  quickChipText: { color: "#0D9488", fontSize: 12, fontWeight: "600" },
  activityBar: {
    marginHorizontal: 12,
    marginBottom: 6,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  inputWrapper: {
    backgroundColor: "#0B1220",
    paddingHorizontal: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#243044",
  },
  attachmentPreviewRow: { marginBottom: 6 },
  attachmentPreviewChip: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    maxWidth: "100%",
    backgroundColor: "#1A2236",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#243044",
    paddingVertical: 4,
    paddingHorizontal: 6,
    gap: 6,
  },
  attachmentPreviewThumb: { width: 28, height: 28, borderRadius: 8 },
  attachmentPreviewIconWrap: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: "rgba(45, 212, 191, 0.12)",
    alignItems: "center", justifyContent: "center",
  },
  attachmentPreviewIcon: { fontSize: 15 },
  attachmentPreviewName: { color: "#E2E8F0", fontSize: 12.5, maxWidth: 160 },
  attachmentPreviewRemove: { padding: 2 },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#1A2236",
    borderRadius: 24,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#243044",
    marginBottom: 4,
  },
  iconButton: {
    width: 36,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 1,
  },
  voiceButton: {
    marginLeft: 2,
  },
  input: {
    flex: 1,
    color: "#F8FAFC",
    fontSize: 15,
    maxHeight: 100,
    paddingHorizontal: 8,
    paddingVertical: 4,
    minHeight: 36,
  },
  actionButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 3,
    shadowOpacity: 0.18,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  stopActionButton: { backgroundColor: "#EF4444" },
  actionButtonDisabled: { opacity: 0.32, shadowOpacity: 0, elevation: 0 },
  plusButton: {
    marginRight: 4,
    borderRadius: 18,
  },
  attachmentPreviewScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  listeningBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.12)",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    gap: 6,
    alignSelf: "flex-start",
  },
  listeningDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  listeningText: {
    color: "#EF4444",
    fontSize: 12,
    fontWeight: "600",
  },
  voiceModeBanner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 6,
    gap: 6,
    alignSelf: "flex-start",
  },
  voiceModeText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
