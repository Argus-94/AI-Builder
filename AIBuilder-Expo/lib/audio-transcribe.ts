/**
 * Расшифровка аудио (STT) через OpenAI-compatible POST /audio/transcriptions.
 * Работает с OpenAI, Groq, OpenRouter (если есть whisper), и кастомными gateway.
 * Для free-tier: пробуем несколько моделей whisper по очереди.
 */

import { File } from "expo-file-system";
import { persistentLogger } from "./persistent-logger";

export type TranscribeOptions = {
  uri: string;
  fileName?: string;
  apiKey: string;
  /** Base URL без хвоста, напр. https://openrouter.ai/api/v1 */
  baseUrl: string;
  language?: string; // "ru" | "uk" | "en" | undefined (auto)
  extraHeaders?: Record<string, string>;
};

const WHISPER_MODELS = [
  "whisper-1",
  "whisper-large-v3",
  "openai/whisper-large-v3",
  "openai/whisper-large-v3-turbo",
  "groq/whisper-large-v3",
];

function guessAudioMime(nameOrUri: string): string {
  const s = nameOrUri.toLowerCase();
  if (s.endsWith(".wav")) return "audio/wav";
  if (s.endsWith(".m4a") || s.endsWith(".aac")) return "audio/mp4";
  if (s.endsWith(".ogg") || s.endsWith(".opus")) return "audio/ogg";
  if (s.endsWith(".webm")) return "audio/webm";
  if (s.endsWith(".flac")) return "audio/flac";
  if (s.endsWith(".mp3")) return "audio/mpeg";
  return "audio/mpeg";
}

function normalizeBaseUrl(baseUrl: string): string {
  return String(baseUrl || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/chat\/completions$/i, "");
}

/**
 * Пытается расшифровать аудиофайл. Возвращает текст или бросает Error с понятным сообщением.
 */
export async function transcribeAudioFile(opts: TranscribeOptions): Promise<string> {
  const apiKey = (opts.apiKey || "").trim();
  const base = normalizeBaseUrl(opts.baseUrl);
  if (!apiKey) throw new Error("STT_NO_API_KEY");
  if (!base) throw new Error("STT_NO_BASE_URL");
  if (!opts.uri) throw new Error("STT_NO_URI");

  const fileName = opts.fileName || opts.uri.split("/").pop() || "audio.mp3";
  const mime = guessAudioMime(fileName || opts.uri);
  const url = `${base}/audio/transcriptions`;

  // Читаем файл как blob через fetch file:// или expo File
  let blob: Blob;
  try {
    const res = await fetch(opts.uri);
    blob = await res.blob();
  } catch {
    // fallback: base64 → data URL → blob (тяжелее, но работает на части URI)
    try {
      const f = new File(opts.uri);
      const b64 = await f.base64();
      const dataUrl = `data:${mime};base64,${b64}`;
      const r2 = await fetch(dataUrl);
      blob = await r2.blob();
    } catch (e: unknown) {
      throw new Error(
        `STT_READ_FAILED: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  if (!blob || blob.size === 0) {
    throw new Error("STT_EMPTY_FILE");
  }
  // Лимит ~25 МБ как у OpenAI Whisper
  if (blob.size > 25 * 1024 * 1024) {
    throw new Error("STT_FILE_TOO_LARGE");
  }

  let lastErr = "unknown";
  for (const model of WHISPER_MODELS) {
    try {
      const form = new FormData();
      form.append("file", blob as any, fileName);
      form.append("model", model);
      form.append("response_format", "json");
      if (opts.language && opts.language !== "auto") {
        // whisper: "ru", "en", "uk" — uk может не поддерживаться везде
        const lang =
          opts.language === "uk" ? "ukrainian" : opts.language === "ru" ? "ru" : "en";
        form.append("language", opts.language === "uk" ? "uk" : opts.language);
      }

      const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        ...(opts.extraHeaders || {}),
      };
      // Не ставим Content-Type — RN/fetch сам выставит boundary для FormData

      persistentLogger.add(
        "debug",
        "STT",
        `POST ${url} model=${model} size=${blob.size}`
      );

      const response = await fetch(url, {
        method: "POST",
        headers,
        body: form as any,
      });

      const textBody = await response.text();
      let data: any = null;
      try {
        data = JSON.parse(textBody);
      } catch {
        data = { raw: textBody };
      }

      if (response.status === 404 || response.status === 400) {
        // модель/эндпоинт не поддерживается — пробуем следующую
        lastErr = `HTTP ${response.status}: ${textBody.slice(0, 160)}`;
        continue;
      }
      if (response.status === 429) {
        throw new Error(`STT_RATE_LIMIT: ${textBody.slice(0, 200)}`);
      }
      if (response.status >= 400) {
        lastErr = `HTTP ${response.status}: ${textBody.slice(0, 200)}`;
        // 401/403 — ключ не подходит, нет смысла перебирать модели
        if (response.status === 401 || response.status === 403) {
          throw new Error(`STT_AUTH: ${lastErr}`);
        }
        continue;
      }

      const transcript =
        (typeof data?.text === "string" && data.text) ||
        (typeof data?.transcript === "string" && data.transcript) ||
        (typeof data?.result === "string" && data.result) ||
        "";

      if (!String(transcript).trim()) {
        lastErr = "empty transcript";
        continue;
      }

      persistentLogger.add(
        "info",
        "STT",
        `OK model=${model} chars=${String(transcript).trim().length}`
      );
      return String(transcript).trim();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.startsWith("STT_")) throw e;
      lastErr = msg;
      continue;
    }
  }

  throw new Error(`STT_FAILED: ${lastErr}`);
}

/** Подбирает baseUrl/apiKey под текущий режим приложения. */
export function resolveSttEndpoint(mode: string, settings: {
  onlineModel?: { apiKey?: string; hasApiKey?: boolean };
  customProvider?: { baseUrl?: string; apiKey?: string; extraHeadersJson?: string };
  openCode?: { baseUrl?: string; apiKey?: string };
  deepSeekApiKey?: string;
}): { baseUrl: string; apiKey: string; extraHeaders?: Record<string, string> } | null {
  if (mode === "custom") {
    const cfg = settings.customProvider;
    if (cfg?.baseUrl?.trim() && cfg?.apiKey?.trim()) {
      let extra: Record<string, string> | undefined;
      if (cfg.extraHeadersJson?.trim()) {
        try {
          extra = JSON.parse(cfg.extraHeadersJson);
        } catch {
          /* ignore */
        }
      }
      return {
        baseUrl: cfg.baseUrl.trim(),
        apiKey: cfg.apiKey.trim(),
        extraHeaders: extra,
      };
    }
  }
  if (mode === "opencode") {
    const oc = settings.openCode;
    if (oc?.baseUrl?.trim() && oc?.apiKey?.trim()) {
      return { baseUrl: oc.baseUrl.trim(), apiKey: oc.apiKey.trim() };
    }
  }
  if (mode === "online") {
    const key = settings.onlineModel?.apiKey?.trim();
    if (key) {
      return {
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: key,
        extraHeaders: {
          "HTTP-Referer": "https://aibuilder.app",
          "X-Title": "AI Builder",
        },
      };
    }
  }
  if (mode === "deepseek") {
    const key = settings.deepSeekApiKey?.trim();
    if (key) {
      // DeepSeek chat API обычно без whisper — пробуем openai-совместимый путь на всякий случай
      return { baseUrl: "https://api.deepseek.com", apiKey: key };
    }
  }
  return null;
}
