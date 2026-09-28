import { useEffect, useState } from "react";
import { Platform, PermissionsAndroid } from "react-native";
import type { Permission } from "react-native/Libraries/PermissionsAndroid/PermissionsAndroid";
import { useLoggerContext } from "../components/LoggerContext";
import { useLanguage } from "../components/LanguageContext";
import { errorMessage } from "../lib/error-utils";

// Разрешение на хранилище (READ/WRITE_EXTERNAL_STORAGE) сюда намеренно не
// входит: его запрашивают точечно в Настройках, в момент реальной загрузки
// пакета/модели (см. app/settings.tsx). Запрос неиспользуемого пока
// разрешения сразу при старте приложения — частая причина того, что
// пользователь рефлекторно отклоняет его "не глядя", после чего Android
// (особенно на MIUI и похожих оболочках) блокирует разрешение навсегда и
// диалог запроса больше не показывается вообще.
//
// Background survival (battery optimization / unrestricted data) is intentionally
// NOT triggered here. Opening system settings on every cold start was a major
// UX regression (user reported being bounced to Settings on relaunch). The
// ensureBackgroundSurvival() helper remains available for explicit user action
// from Settings → Background survival.
const ANDROID_PERMISSIONS: Permission[] = [
  "android.permission.READ_MEDIA_IMAGES",
  "android.permission.READ_MEDIA_VIDEO",
  "android.permission.READ_MEDIA_AUDIO",
  "android.permission.POST_NOTIFICATIONS",
];

export function usePermissions() {
  const { logInfo, logWarn, logError } = useLoggerContext();
  const { t } = useLanguage();
  const [granted, setGranted] = useState(false);
  const [status, setStatus] = useState<"requesting" | "granted" | "denied">("requesting");

  useEffect(() => {
    logInfo("Permissions", t("permStartLog"));

    if (Platform.OS !== "android") {
      logInfo("Permissions", t("permNotAndroidLog"));
      setGranted(true);
      setStatus("granted");
      return;
    }

    const requestPermissions = async () => {
      try {
        const results = await PermissionsAndroid.requestMultiple(ANDROID_PERMISSIONS);
        const entries = Object.entries(results);
        const allGranted = entries.every(
          ([, result]) => result === PermissionsAndroid.RESULTS.GRANTED
        );

        entries.forEach(([perm, result]) => {
          const name = perm.split(".").pop() || perm;
          if (result === PermissionsAndroid.RESULTS.GRANTED) {
            logInfo("Permissions", t("permGrantedLog", { name }));
          } else if (result === PermissionsAndroid.RESULTS.DENIED) {
            logWarn("Permissions", t("permDeniedLog", { name }));
          } else if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) {
            logError("Permissions", t("permNeverAskLog", { name }));
          }
        });

        setGranted(allGranted);
        setStatus(allGranted ? "granted" : "denied");
        // Background survival (battery / unrestricted data) is NOT auto-requested
        // on startup. See comment above the ANDROID_PERMISSIONS constant.

        if (allGranted) {
          logInfo("Permissions", t("permAllGrantedLog"));
        } else {
          logError("Permissions", t("permNotAllGrantedLog"));
        }
      } catch (err: unknown) {
        logError("Permissions", t("permRequestErrorLog", { message: errorMessage(err) }));
        setGranted(false);
        setStatus("denied");
      }
    };

    requestPermissions();
    // Запускаем один раз при старте приложения — реальный запрос системных
    // разрешений не имеет смысла повторять при смене языка интерфейса.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { granted, status };
}
