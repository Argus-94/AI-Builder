import type { TranslationKey } from "./i18n";

type TFunc = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * lib/local-model.ts и lib/online-model.ts — обычные TS-модули без доступа к
 * useLanguage(), поэтому вместо готового переведённого текста они бросают
 * короткие технические коды ("MODEL_NOT_DOWNLOADED", "NO_KEY",
 * "HTTP:404:...", и т.д.). Эта функция вызывается уже внутри React-хуков
 * (hooks/useLLM.ts, hooks/useAppSettings.ts), где useLanguage().t доступен,
 * и превращает код в текст на текущем языке интерфейса.
 *
 * Если код не распознан — значит, ошибка пришла напрямую из нативного слоя
 * (llama.rn, сеть, expo-file-system и т.п.) и уже содержит полезное
 * техническое сообщение; такие сообщения показываются как есть.
 */
export function translateEngineError(t: TFunc, message: string): string {
  if (message === "MODEL_NOT_DOWNLOADED") return t("errorModelNotDownloaded");
  if (message === "MODEL_NOT_LOADED") return t("errorOfflineNotLoaded");
  if (message === "VISION_NOT_READY") return t("errorVisionNotReady");
  if (message === "NO_KEY") return t("errorNoApiKey");
  if (message === "EMPTY") return t("errorEmptyResponse");

  if (message.startsWith("NETWORK:")) {
    return t("errorNetworkTemplate", { message: message.slice("NETWORK:".length) });
  }

  if (message.startsWith("HTTP:")) {
    const rest = message.slice("HTTP:".length);
    const sepIdx = rest.indexOf(":");
    const status = sepIdx >= 0 ? rest.slice(0, sepIdx) : rest;
    const details = sepIdx >= 0 ? rest.slice(sepIdx + 1) : "";
    // Дневной лимит бесплатных запросов OpenRouter (общий на весь аккаунт,
    // не поломка конкретной модели) — показываем понятное сообщение вместо
    // сырого "OpenRouter вернул ошибку 429: Rate limit exceeded:
    // free-models-per-day...", которое выглядело как техническая поломка.
    if (status === "429" && details.toLowerCase().includes("free-models-per-day")) {
      return t("errorDailyFreeLimit");
    }
    return t("errorHttpTemplate", { status, details });
  }

  return message;
}
