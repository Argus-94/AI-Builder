import type { ExpoConfig, ConfigContext } from "expo/config";
import fs from "node:fs";
import path from "node:path";
import withFixGradleProperties from "./plugins/withFixGradleProperties";
import withEnsureBuildConfig from "./plugins/withEnsureBuildConfig";
import withAndroidWindowSoftInput from "./plugins/withAndroidWindowSoftInput";
import withLlamaRnProguard from "./plugins/withLlamaRnProguard";
import withTermuxBridge from "./plugins/withTermuxBridge";
import withAibDeviceWatchdog from "./plugins/withAibDeviceWatchdog";
import withAibNativeAccel from "./plugins/withAibNativeAccel";

const APP_VERSION = JSON.parse(fs.readFileSync(path.join(__dirname, "package.json"), "utf8")).version as string;

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "AI Builder",
  slug: "ai-builder",
  scheme: "aibuilder",
  version: APP_VERSION,
  orientation: "portrait",
  userInterfaceStyle: "dark",
  newArchEnabled: true,
  icon: "./assets/images/icon.png",
  android: {
    package: "com.sakana.aibuilder",
    adaptiveIcon: {
      foregroundImage: "./assets/images/adaptive-icon-fg.png",
      backgroundImage: "./assets/images/adaptive-icon-bg.png"
    },
    // Модели/пакеты скачиваются в sandbox/cache приложения и не требуют
    // широкого доступа к внешнему хранилищу. Termux RUN_COMMAND получает
    // результаты через PendingIntent, поэтому MANAGE_EXTERNAL_STORAGE также
    // не нужен.
    permissions: [
      "android.permission.INTERNET",
      "android.permission.ACCESS_NETWORK_STATE",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.READ_MEDIA_IMAGES",
      "android.permission.READ_MEDIA_VIDEO",
      "android.permission.READ_MEDIA_AUDIO",
      // Android foreground-service permissions are intentionally not declared here.
      // The former ModelKeepAliveService used dataSync to keep a ~3 GB model resident
      // indefinitely, which is not an appropriate dataSync use case on Android 15+.
      "android.permission.WAKE_LOCK",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE",
      "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS",
      "android.permission.RECORD_AUDIO",
      "android.permission.REQUEST_INSTALL_PACKAGES"
    ]
  },
  plugins: ([
    "expo-router",
    // "Unresolved reference 'BuildConfig'/'R'" на release-сборке — известная
    // проблема AGP 8+, если buildConfig явно не включён. См.
    // plugins/withEnsureBuildConfig.js.
    withEnsureBuildConfig,
    withAndroidWindowSoftInput,
    withLlamaRnProguard,
    // No indefinite foreground service is used for local-model residency.
    // See A-03 remediation in lib/keep-alive.ts.
    // Офлайн-модель (llama.rn / llama.cpp) — CPU-инференс на любом Android-
    // телефоне, поэтому OpenCL (GPU-ускорение под конкретный чипсет) здесь
    // намеренно выключен: меньше риск проблем со сборкой/совместимостью на
    // разных устройствах, важнее стабильная работа "из коробки".
    [
      "llama.rn",
      {
        enableOpenCLAndHexagon: false
      }
    ],
    // Termux-сессия (экран «Настройки Termux» -> Termux On/Off -> вкладка «Сессия») —
    // мост к отдельно установленному Termux + Termux:API через официальный
    // RUN_COMMAND intent. Добавляет только RUN_COMMAND и package visibility;
    // результаты приходят через PendingIntent без MANAGE_EXTERNAL_STORAGE.
    withTermuxBridge,
    withAibDeviceWatchdog,
    // Open MIT path-accel slot (NativeModules.AibNativeAccel). No proprietary proroot.
    withAibNativeAccel,
    [
      "expo-speech-recognition",
      {
        // Системный текст диалога разрешения (Android / iOS). На Android 13+
        // диалог иногда не появляется, если permission уже "denied" без canAskAgain —
        // тогда UI предлагает «Открыть настройки».
        microphonePermission: "AI Builder использует микрофон для голосового ввода запросов.",
        speechRecognitionPermission: "AI Builder использует распознавание речи для преобразования голоса в текст.",
        androidSpeechServicePackages: [
          "com.google.android.googlequicksearchbox",
          "com.google.android.as",
          "com.samsung.android.bixby.agent"
        ]
      }
    ],
    [
      "expo-notifications",
      {
        icon: "./assets/images/notification-icon.png",
        color: "#0F172A",
        defaultChannel: "agent",
      },
    ],
    // ВАЖНО: withFixGradleProperties должен быть ПОСЛЕДНИМ в массиве
    // plugins (см. build-prompt-universal-v3.md, правило B.4) — он
    // патчит gradle.properties/settings.gradle уже ПОСЛЕ того, как все
    // остальные плагины (в т.ч. llama.rn, withTermuxBridge и т.д.)
    // дописали в них свои собственные настройки при `expo prebuild`.
    // Если поставить его раньше — правки этого плагина оказываются "под"
    // более поздними плагинами и затираются/склеиваются заново, из-за
    // чего CBE падает на 403 от Maven Central и на склеенных свойствах
    // gradle.properties. Именно это и было причиной поломки сборки.
    withFixGradleProperties
  ] as any),
  extra: {}
});
