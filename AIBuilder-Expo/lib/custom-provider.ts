import { errorMessage } from "./error-utils";
/**
 * Custom LLM provider (OpenAI-compatible API) + OpenCode support.
 *
 * Allows connecting any provider that exposes a chat/completions endpoint:
 * - xAI Grok (https://api.x.ai/v1)
 * - Anthropic Claude (via OpenAI-compatible proxy or official)
 * - OpenCode / local gateways
 * - Any other OpenAI-style API
 *
 * Settings are stored in SecureStore / AsyncStorage via useAppSettings.
 */

import axios from "axios";
import { persistentLogger } from "./persistent-logger";


/** Only https (and loopback http for local dev) are allowed. */
export function assertSafeProviderBaseUrl(baseUrl: string): string {
  const raw = String(baseUrl || "").trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Base URL is required");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("Base URL is not a valid URL");
  }
  const host = url.hostname.toLowerCase();
  const isLoopback = host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  if (url.protocol === "https:") return raw;
  if (url.protocol === "http:" && isLoopback) return raw;
  throw new Error("Base URL must use https:// (http only allowed for localhost/127.0.0.1)");
}


function extractProviderErrorMessage(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const error = (value as { error?: unknown }).error;
  if (!error || typeof error !== "object") return undefined;
  const message = (error as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

/** Redact secrets from strings before logging. */
function redactSecrets(s: string): string {
  return String(s || "")
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, "Bearer ***")
    .replace(/("?(?:api[_-]?key|authorization|x-api-key)"?\s*[:=]\s*")([^"]{4,})(")/gi, "$1***$3")
    .replace(/(sk-[A-Za-z0-9]{8,})/g, "sk-***")
    .replace(/(key[=:])([A-Za-z0-9_\-]{8,})/gi, "$1***");
}

/**
 * Full Axios diagnostic for Network Error cases where response is missing.
 * Never logs Authorization / api keys.
 */
export function logAxiosDiagnostic(tag: string, e: unknown, context?: { url?: string; method?: string }) {
  try {
    if (axios.isAxiosError(e)) {
      const safe = {
        message: redactSecrets(e.message || ""),
        code: e.code || null,
        name: e.name || null,
        status: e.response?.status ?? null,
        statusText: e.response?.statusText ?? null,
        hasResponse: !!e.response,
        hasRequest: !!e.request,
        method: (e.config?.method || context?.method || "").toUpperCase() || null,
        url: redactSecrets(String(e.config?.url || context?.url || "")),
        timeout: e.config?.timeout ?? null,
        cause: e.cause != null ? redactSecrets(String(e.cause)) : null,
        data:
          e.response?.data != null
            ? redactSecrets(
                typeof e.response.data === "string"
                  ? e.response.data.slice(0, 400)
                  : JSON.stringify(e.response.data).slice(0, 400)
              )
            : null,
      };
      persistentLogger.add("error", tag, JSON.stringify(safe));
      return;
    }
    persistentLogger.add("error", tag, redactSecrets(errorMessage(e)));
  } catch {
    persistentLogger.add("error", tag, errorMessage(e));
  }
}

/** Providers that document max_completion_tokens instead of max_tokens. */
function prefersMaxCompletionTokens(baseUrl: string, modelId: string): boolean {
  const hay = `${baseUrl} ${modelId}`.toLowerCase();
  return /mimo|xiaomi|xiaomimimo|api\.xiaomi/.test(hay);
}

/** Build chat body with correct token field for the target API. */
function buildChatBody(
  modelId: string,
  messages: ChatMessage[],
  params: CustomGenerationParams,
  baseUrl: string
): Record<string, unknown> {
  const tokenLimit = Math.max(1, Math.min(128000, params.maxTokens));
  const body: Record<string, unknown> = {
    model: modelId,
    messages,
    temperature: Math.max(0, Math.min(2, params.temperature)),
    top_p: Math.max(0, Math.min(1, params.topP)),
    stream: false,
  };
  if (prefersMaxCompletionTokens(baseUrl, modelId)) {
    body.max_completion_tokens = tokenLimit;
  } else {
    body.max_tokens = tokenLimit;
  }
  return body;
}
export interface CustomProviderConfig {
  /** Display name, e.g. "Grok", "Claude", "OpenCode" */
  name: string;
  /** Base URL without trailing slash, e.g. https://api.x.ai/v1 */
  baseUrl: string;
  /** API key (Bearer) */
  apiKey: string;
  /** Model id, e.g. grok-2-latest, claude-3-5-sonnet-20241022, opencode */
  modelId: string;
  /** Optional extra headers as JSON object string */
  extraHeadersJson?: string;
  /** Use OpenAI-compatible /chat/completions path (default true) */
  openAiCompatible?: boolean;
  /** Path override, default /chat/completions */
  chatPath?: string;
}

export interface CustomGenerationParams {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export const DEFAULT_CUSTOM_PARAMS: CustomGenerationParams = {
  temperature: 0.7,
  maxTokens: 4096,
  topP: 0.95,
};

export const DEFAULT_CUSTOM_CONFIG: CustomProviderConfig = {
  name: "Custom",
  baseUrl: "",
  apiKey: "",
  modelId: "",
  openAiCompatible: true,
  chatPath: "/chat/completions",
};

/** Presets for common providers */
export const CUSTOM_PROVIDER_PRESETS: Array<{
  id: string;
  name: string;
  baseUrl: string;
  modelId: string;
  hint: string;
}> = [
  {
    id: "xai-grok",
    name: "xAI Grok",
    baseUrl: "https://api.x.ai/v1",
    modelId: "grok-2-latest",
    hint: "API key from console.x.ai",
  },
  {
    id: "opencode",
    name: "OpenCode",
    baseUrl: "https://opencode.ai/zen/v1",
    modelId: "",
    hint: "Ключ OpenCode Zen/Go (console.opencode.ai) — после сохранения URL и ключа нажмите «Получить список моделей»",
  },
  {
    id: "anthropic",
    name: "Anthropic Claude (via proxy)",
    baseUrl: "https://api.anthropic.com/v1",
    modelId: "claude-3-5-sonnet-20241022",
    hint: "Официальный api.anthropic.com НЕ OpenAI-compatible. Нужен OpenAI-compatible proxy (LiteLLM/OpenRouter). Прямой /chat/completions не работает.",
  },
  {
    id: "xiaomi-mimo",
    name: "Xiaomi MiMo",
    baseUrl: "https://api.xiaomimimo.com/v1",
    modelId: "mimo-v2.5",
    hint: "Использует max_completion_tokens. Base URL уточните в docs Xiaomi MiMo.",
  },
  {
    id: "openai",
    name: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    modelId: "gpt-4o-mini",
    hint: "OpenAI API key",
  },
  {
    id: "local",
    name: "Local / Custom",
    baseUrl: "http://127.0.0.1:8080/v1",
    modelId: "local-model",
    hint: "Any OpenAI-compatible local server",
  },
];

/** OpenAI-compatible multimodal part (vision). */
export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail?: "auto" | "low" | "high" } };

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  /** Текст или массив частей (text + image_url) для vision-моделей. */
  content: string | ChatContentPart[];
}

interface ChatResponse {
  choices?: Array<{
    message?: { content?: string; role?: string };
    text?: string;
  }>;
  content?: Array<{ text?: string }> | string;
  output?: string;
  error?: { message?: string };
}

export class CustomProviderEngine {
  private config: CustomProviderConfig = { ...DEFAULT_CUSTOM_CONFIG };

  setConfig(cfg: Partial<CustomProviderConfig>): void {
    this.config = { ...this.config, ...cfg };
  }

  getConfig(): CustomProviderConfig {
    return { ...this.config };
  }

  getReady(): boolean {
    return !!(
      this.config.baseUrl?.trim() &&
      this.config.apiKey?.trim() &&
      this.config.modelId?.trim()
    );
  }

  async chat(
    messages: ChatMessage[],
    params: CustomGenerationParams = DEFAULT_CUSTOM_PARAMS
  ): Promise<string> {
    if (!this.getReady()) {
      throw new Error("Custom provider: base URL, API key and model id are required");
    }

    const base = assertSafeProviderBaseUrl(this.config.baseUrl);
    const path = (this.config.chatPath || "/chat/completions").startsWith("/")
      ? this.config.chatPath || "/chat/completions"
      : `/${this.config.chatPath || "chat/completions"}`;
    const url = `${base}${path}`;

    let extraHeaders: Record<string, string> = {};
    if (this.config.extraHeadersJson?.trim()) {
      try {
        extraHeaders = JSON.parse(this.config.extraHeadersJson);
      } catch {
        persistentLogger.add("warn", "CustomProvider", "Invalid extraHeadersJson, ignored");
      }
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.apiKey}`,
      ...extraHeaders,
    };

    const hasVisionParts = messages.some(
      (m) =>
        Array.isArray(m.content) &&
        m.content.some((p) => p && typeof p === "object" && p.type === "image_url")
    );
    // Для vision-запросов не режем модель по text-only эвристике:
    // qwen-vl / gpt-4o / gemini и т.п. — валидный chat/completions с картинкой.
    if (!hasVisionParts && !isLikelyChatModel({ id: this.config.modelId })) {
      throw new Error(
        `Selected model "${this.config.modelId}" is not a text chat model. Choose a model that supports /chat/completions.`
      );
    }

    // Anthropic-style key header if base looks like anthropic
    if (/anthropic/i.test(base) && !headers["x-api-key"]) {
      headers["x-api-key"] = this.config.apiKey;
      headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
    }

    const body = buildChatBody(this.config.modelId, messages, params, base);

    // Free-модели (:free): 429 + rate-limit retries.
    // Платные / MiMo: отдельно ретраим ERR_NETWORK / timeout / connection reset
    // (в логе: короткий "Привет" OK, длинный POST обрывается без HTTP response).
    const freeModel = isFreeModel({ id: this.config.modelId });
    const isMimoLike = prefersMaxCompletionTokens(base, this.config.modelId);
    // free: до 5; сеть/MiMo: до 4; обычные платные: 2 (на случай одноразового обрыва)
    const maxAttempts = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        if (attempt === 0) {
          persistentLogger.add(
            "debug",
            "CustomProvider",
            `POST ${url} model=${this.config.modelId}`
          );
        } else {
          persistentLogger.add(
            "warn",
            "CustomProvider",
            `retry ${attempt}/${maxAttempts - 1} model=${this.config.modelId}`
          );
        }

        // Diagnostic metadata only: request body itself is never logged.
        const __mrT0 = Date.now();
      persistentLogger.markModelRequest(
          this.config.name || "CustomProvider",
          this.config.modelId,
          messages as Array<{ role?: string; content?: unknown }>,
          (() => { try { return JSON.stringify(body).length; } catch { return 0; } })(),
          this.config.name === "OpenCode" ? "opencode" : "chat",
          false,
          attempt + 1
        );
        // RN/OkHttp: без Connection: close длинные ответы иногда рвутся при background
        const response = await axios.post<ChatResponse>(url, body, {
          headers: {
            ...headers,
            Connection: "keep-alive",
            "Keep-Alive": "timeout=120",
          },
          timeout: isMimoLike ? 300_000 : 180_000,
          maxContentLength: 50 * 1024 * 1024,
          maxBodyLength: 50 * 1024 * 1024,
          validateStatus: () => true,
          // Не сбрасывать сокет при кратких паузах
          transitional: { clarifyTimeoutError: true },
        });

        if (response.status === 429 && attempt < maxAttempts - 1) {
          const errMsg =
            extractProviderErrorMessage(response.data) ||
            (typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data || {}).slice(0, 300));
          const delayMs = freeModel
            ? parseFreeRateLimitDelayMs(errMsg, response.headers)
            : Math.min(60_000, 5_000 * (attempt + 1));
          persistentLogger.add(
            "warn",
            "CustomProvider",
            `HTTP 429 — ждём ${Math.ceil(delayMs / 1000)}с и повторяем (${errMsg.slice(0, 120)})`
          );
          await sleepMs(delayMs);
          continue;
        }

        // 502/503/504 — transient upstream, retry
        if ([502, 503, 504].includes(response.status) && attempt < maxAttempts - 1) {
          const delayMs = Math.min(30_000, 2_000 * Math.pow(2, attempt));
          persistentLogger.add(
            "warn",
            "CustomProvider",
            `HTTP ${response.status} transient — retry in ${Math.ceil(delayMs / 1000)}s`
          );
          await sleepMs(delayMs);
          continue;
        }

        if (response.status >= 400) {
          const errMsg =
            extractProviderErrorMessage(response.data) ||
            (typeof response.data === "string"
              ? response.data
              : JSON.stringify(response.data).slice(0, 200));
          throw new Error(`HTTP ${response.status}: ${errMsg}`);
        }

        const data = response.data;
        const choice = data?.choices?.[0];
        const messageContent = choice?.message?.content;
        const contentText = Array.isArray(messageContent)
          ? messageContent
              .map((part: any) =>
                typeof part === "string" ? part : (part?.text ?? part?.content ?? "")
              )
              .join("")
          : messageContent;
        const outputText = Array.isArray(data?.output)
          ? data.output
              .flatMap((item: any) =>
                Array.isArray(item?.content) ? item.content : [item]
              )
              .map((item: any) =>
                typeof item === "string" ? item : (item?.text ?? item?.content ?? "")
              )
              .join("")
          : data?.output;
        const text =
          (typeof contentText === "string" ? contentText : "") ||
          (typeof choice?.text === "string" ? choice.text : "") ||
          (typeof data?.content === "string" ? data.content : "") ||
          (typeof outputText === "string" ? outputText : "") ||
          (typeof data?.text === "string" ? data.text : "") ||
          (typeof choice?.message?.reasoning_content === "string"
            ? choice.message.reasoning_content
            : "") ||
          "";

        if (!String(text).trim()) {
          const shape = (() => {
            try {
              return JSON.stringify({
                object: data?.object,
                status: data?.status,
                choices: Array.isArray(data?.choices) ? data.choices.length : undefined,
                hasMessage: !!choice?.message,
                hasContent: messageContent != null,
                hasOutput: data?.output != null,
              });
            } catch {
              return "{}";
            }
          })();
          throw new Error(`Empty response from custom provider (${shape})`);
        }
        const finalText = String(text).trim();
        persistentLogger.markModelResponse(
          this.config.name || "CustomProvider",
          this.config.modelId || "?",
          finalText
        );
        return finalText;
      } catch (e: unknown) {
        // Полная диагностика (code/cause/status) — без секретов
        logAxiosDiagnostic("CustomProvider", e, { url, method: "POST" });

        const axiosData = axios.isAxiosError(e) ? e.response?.data : undefined;
        let msg = axiosData
          ? typeof axiosData === "string"
            ? axiosData.slice(0, 300)
            : JSON.stringify(axiosData).slice(0, 300)
          : errorMessage(e);
        // Обогащаем Network Error кодом axios, иначе в UI только "Network Error"
        if (axios.isAxiosError(e) && !e.response) {
          const parts = [e.message || "Network Error"];
          if (e.code) parts.push(`code=${e.code}`);
          if (e.cause) parts.push(`cause=${String(e.cause).slice(0, 120)}`);
          msg = parts.join(" · ");
        }
        lastError = new Error(`Custom provider: ${redactSecrets(msg)}`);

        const isNetworkDrop =
          axios.isAxiosError(e) &&
          !e.response &&
          (/ERR_NETWORK|ECONNABORTED|ETIMEDOUT|ENOTFOUND|ECONNRESET|EPIPE|socket hang up|Network Error|timeout/i.test(
            `${e.code || ""} ${e.message || ""} ${msg}`
          ) ||
            e.code === "ERR_NETWORK" ||
            e.code === "ECONNABORTED");

        // 429 text in network/error body
        if (
          attempt < maxAttempts - 1 &&
          /HTTP\s*429|Too many requests|rate limit|retry in\s*\d/i.test(msg)
        ) {
          const delayMs = freeModel
            ? parseFreeRateLimitDelayMs(msg, undefined)
            : Math.min(45_000, 4_000 * (attempt + 1));
          persistentLogger.add(
            "warn",
            "CustomProvider",
            `429/rate-limit — ждём ${Math.ceil(delayMs / 1000)}с и повторяем`
          );
          await sleepMs(delayMs);
          continue;
        }

        // Главный фикс по логу: длинный POST к MiMo → ERR_NETWORK без response.
        // Ретраим с backoff; не долбим сервер пачкой (1 запрос за раз).
        if (isNetworkDrop && attempt < maxAttempts - 1) {
          const delayMs = Math.min(45_000, 3_000 * Math.pow(2, attempt));
          persistentLogger.add(
            "warn",
            "CustomProvider",
            `Network drop (${e && axios.isAxiosError(e) ? e.code : "?"}) — ждём ${Math.ceil(delayMs / 1000)}с, попытка ${attempt + 2}/${maxAttempts}`
          );
          await sleepMs(delayMs);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error("Custom provider: rate limit exceeded after retries");
  }

  /**
   * Анализ изображения через OpenAI-compatible vision API
   * (content: [{type:"text"}, {type:"image_url", image_url:{url: dataUrl}}]).
   * Работает с OpenRouter, OpenCode Zen, xAI, OpenAI и любым gateway,
   * который принимает multimodal /chat/completions.
   */
  async analyzeImage(
    imageDataUrl: string,
    prompt: string,
    params: CustomGenerationParams = DEFAULT_CUSTOM_PARAMS,
    systemPrompt?: string
  ): Promise<string> {
    const messages: ChatMessage[] = [];
    if (systemPrompt?.trim()) {
      messages.push({ role: "system", content: systemPrompt.trim() });
    }
    messages.push({
      role: "user",
      content: [
        { type: "text", text: prompt || "Describe this image in detail." },
        {
          type: "image_url",
          image_url: { url: imageDataUrl, detail: "auto" },
        },
      ],
    });
    // chat() уже умеет retry для free и шлёт messages как есть
    return this.chat(messages, params);
  }
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

/**
 * Извлекает задержку ожидания из текста 429 / заголовков.
 * Примеры: "retry in 17s", "retry after 30 seconds", Retry-After: 20
 * Free-модели на некоторых gateway: 1 req/min → минимум ~20–65 с.
 */
function parseFreeRateLimitDelayMs(
  message: string,
  headers?: Record<string, unknown> | { get?: (k: string) => string | null }
): number {
  const msg = String(message || "");

  // "retry in 17s" / "retry in 17 seconds" / "retry after 30s"
  const m1 = msg.match(/retry\s+(?:in|after)\s+(\d+)\s*(s|sec|secs|second|seconds)?/i);
  if (m1) {
    const sec = parseInt(m1[1], 10);
    if (Number.isFinite(sec) && sec > 0) {
      // +2 с запас на рассинхрон часов
      return Math.min(120_000, (sec + 2) * 1000);
    }
  }

  // "1 request(s) every 1 min" → ждать ~60 с
  const m2 = msg.match(/every\s+(\d+)\s*min/i);
  if (m2) {
    const min = parseInt(m2[1], 10);
    if (Number.isFinite(min) && min > 0) {
      return Math.min(180_000, min * 60_000 + 3000);
    }
  }

  // Retry-After header (секунды)
  try {
    const h = headers as any;
    const raw =
      (typeof h?.get === "function" ? h.get("retry-after") : null) ||
      h?.["retry-after"] ||
      h?.["Retry-After"];
    if (raw != null) {
      const sec = parseInt(String(raw), 10);
      if (Number.isFinite(sec) && sec > 0) {
        return Math.min(120_000, (sec + 1) * 1000);
      }
    }
  } catch {
    /* ignore */
  }

  // Дефолт для free: 20 с (типичный 1 req / ~мин на некоторых free endpoints)
  return 20_000;
}

export const customProviderEngine = new CustomProviderEngine();

/** OpenCode-specific thin wrapper (same engine, preset defaults) */
export const OPENCODE_DEFAULTS: CustomProviderConfig = {
  name: "OpenCode",
  // ИСПРАВЛЕНО: https://api.opencode.ai/v1 — несуществующий домен (в логе он
  // отдавал пустой ответ, отсюда "Empty response from custom provider").
  // Настоящий OpenAI-совместимый шлюз OpenCode называется OpenCode Zen и
  // живёт по адресу https://opencode.ai/zen/v1 (chat/completions и models).
  // См. https://opencode.ai/docs/providers/
  baseUrl: "https://opencode.ai/zen/v1",
  apiKey: "",
  // Раньше здесь был захардкожен несуществующий id модели "opencode" — с
  // ним провайдер всегда возвращал ошибку. Теперь модель нужно выбрать из
  // списка, который подтягивается через fetchCustomProviderModels().
  modelId: "",
  openAiCompatible: true,
  chatPath: "/chat/completions",
};

/** Модель, полученная от эндпоинта GET {baseUrl}/models. */
export interface FetchedModel {
  id: string;
  /** Человекочитаемое имя, если отличается от id. */
  name?: string;
  /** Optional provider metadata used to hide non-chat models from the chat picker. */
  kind?: string;
  /** Цена prompt/completion если провайдер её отдаёт (OpenRouter и аналоги). */
  pricing?: { prompt?: number | string; completion?: number | string };
}

/** Группа модели в UI списка провайдера. */
export type ModelGroupKind = "free" | "paid" | "unsuitable";

export interface GroupedProviderModels {
  free: FetchedModel[];
  paid: FetchedModel[];
  /** Image / embed / audio / прочие — не для чата и не для Termux-агента. */
  unsuitable: FetchedModel[];
}

/**
 * Chat in AI Builder sends OpenAI-compatible /chat/completions requests.
 * Provider /models endpoints can also return audio, embeddings, rerank,
 * image and other non-chat models. Those must not be offered as chat choices.
 */
export function isLikelyChatModel(model: Pick<FetchedModel, "id" | "name" | "kind">): boolean {
  const id = (model.id || "").toLowerCase();
  const haystack = `${id} ${model.name || ""} ${model.kind || ""}`.toLowerCase();

  // 1. Image generation and diffusion models (в т.ч. из скриншота: absolutereality, albedobase, amponyxl…)
  if (
    /\b(sdxl|stable-diffusion|stable_diffusion|dall-e|dalle|flux|midjourney|image-gen|img2img|text2img|wai-nsfw|illustrious|pony|realvis|juggernaut|albedo|albedobase|absolutereality|amponyxl|anything-v|anything-xl|autismmix|dreamshaper|realistic-vision|cyberrealistic|deliberate|revanimated|diffusion|text2image|image2image)\b/.test(
      haystack
    ) ||
    /[-_](sd|sdxl|flux|pony|xl)[-_:]/.test(id) ||
    id.includes("sdxl") ||
    id.includes("flux") ||
    id.includes("diffusion") ||
    /(?:^|[:/-])(xl|sdxl|flux)(?:$|[:/-])/.test(id)
  ) {
    return false;
  }

  // 2. Embedding, rerank, and moderation models
  if (
    /\b(embed|embedding|embeddings|text-embedding|bge-|e5-|gte-|minilm|rerank|moderation|classifier)\b/.test(
      haystack
    ) ||
    id.startsWith("bge-") ||
    id.startsWith("e5-") ||
    id.startsWith("gte-")
  ) {
    return false;
  }

  // 3. Audio / TTS / STT models
  if (
    /\b(text-to-speech|tts|speech-synthesis|transcri(?:be|ption)|whisper|aura-|aura|bark|tortoise|xtts|playht)\b/.test(
      haystack
    ) ||
    id.startsWith("aura-") ||
    id.startsWith("whisper")
  ) {
    return false;
  }

  // 4. Explicit kind metadata from provider
  const explicitKind = String(model.kind || "").toLowerCase();
  if (
    explicitKind &&
    /^(audio|embedding|embeddings|rerank|moderation|image|video|speech|transcription|tts|stt)$/.test(
      explicitKind
    )
  ) {
    return false;
  }

  return true;
}

/** Бесплатная модель: суффикс :free / -free, или pricing ≈ 0. */
export function isFreeModel(model: Pick<FetchedModel, "id" | "name" | "pricing">): boolean {
  const id = (model.id || "").toLowerCase();
  const name = (model.name || "").toLowerCase();
  if (/:free$/i.test(id) || /-free$/i.test(id) || /\/free$/i.test(id)) return true;
  if (/\bfree\b/.test(name) && /:free|-free|\/free/.test(id)) return true;
  const p = model.pricing;
  if (p) {
    const prompt = Number(p.prompt);
    const completion = Number(p.completion);
    if (
      Number.isFinite(prompt) &&
      Number.isFinite(completion) &&
      prompt === 0 &&
      completion === 0
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Модель не подходит для Termux-агента / чата AI Builder:
 * image, embeddings, audio, и т.п. — нет смысла выбирать их для code/agent loop.
 */
export function isUnsuitableForTermux(model: Pick<FetchedModel, "id" | "name" | "kind">): boolean {
  return !isLikelyChatModel(model);
}

export function filterChatModels(models: FetchedModel[]): FetchedModel[] {
  return models.filter(isLikelyChatModel);
}

export function categorizeProviderModels(models: FetchedModel[]): {
  chatModels: FetchedModel[];
  nonChatModels: FetchedModel[];
} {
  const chatModels: FetchedModel[] = [];
  const nonChatModels: FetchedModel[] = [];

  for (const m of models) {
    if (isLikelyChatModel(m)) {
      chatModels.push(m);
    } else {
      nonChatModels.push(m);
    }
  }

  return { chatModels, nonChatModels };
}

/**
 * Разбивает полный список провайдера на 3 группы для UI:
 *  1) free — бесплатные chat-модели
 *  2) paid — платные chat-модели
 *  3) unsuitable — image / embed / audio (не для чата и не для Termux)
 *
 * Сортировка внутри группы: по id.
 */
export function groupProviderModels(models: FetchedModel[]): GroupedProviderModels {
  const free: FetchedModel[] = [];
  const paid: FetchedModel[] = [];
  const unsuitable: FetchedModel[] = [];

  for (const m of models) {
    if (isUnsuitableForTermux(m)) {
      unsuitable.push(m);
    } else if (isFreeModel(m)) {
      free.push(m);
    } else {
      paid.push(m);
    }
  }

  const byId = (a: FetchedModel, b: FetchedModel) => a.id.localeCompare(b.id);
  free.sort(byId);
  paid.sort(byId);
  unsuitable.sort(byId);
  return { free, paid, unsuitable };
}

/**
 * Запрашивает список доступных моделей у OpenAI-совместимого провайдера
 * (GET {baseUrl}/models) — используется и для OpenCode, и для произвольного
 * кастомного провайдера, чтобы не заставлять пользователя вручную угадывать
 * id модели.
 *
 * Понимает несколько распространённых форматов ответа:
 *  - OpenAI-style: { object: "list", data: [{ id, ... }, ...] }
 *  - { models: [{ id, ... }, ...] }
 *  - просто массив [{ id, ... }, ...] или массив строк
 */
export async function fetchCustomProviderModels(
  cfg: Pick<CustomProviderConfig, "baseUrl" | "apiKey"> & { extraHeadersJson?: string }
): Promise<FetchedModel[]> {
  const baseUrl = assertSafeProviderBaseUrl(cfg.baseUrl || "");


  let extraHeaders: Record<string, string> = {};
  if (cfg.extraHeadersJson?.trim()) {
    try {
      extraHeaders = JSON.parse(cfg.extraHeadersJson);
    } catch {
      persistentLogger.add("warn", "CustomProvider", "Invalid extraHeadersJson, ignored");
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(cfg.apiKey?.trim() ? { Authorization: `Bearer ${cfg.apiKey.trim()}` } : {}),
    ...extraHeaders,
  };
  if (/anthropic/i.test(baseUrl) && cfg.apiKey?.trim() && !headers["x-api-key"]) {
    headers["x-api-key"] = cfg.apiKey.trim();
    headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
  }

  const url = `${baseUrl}/models`;
  persistentLogger.add("debug", "CustomProvider", `GET ${url}`);

  let response;
  try {
    response = await axios.get(url, {
      headers,
      timeout: 20_000,
      validateStatus: () => true,
    });
  } catch (e) {
    logAxiosDiagnostic("CustomProvider", e, { url, method: "GET" });
    const msg = axios.isAxiosError(e) && !e.response
      ? `${errorMessage(e)}${e.code ? ` · code=${e.code}` : ""}`
      : errorMessage(e);
    throw new Error(msg);
  }

  if (response.status >= 400) {
    const errMsg =
      extractProviderErrorMessage(response.data) ||
      (typeof response.data === "string"
        ? response.data.slice(0, 200)
        : JSON.stringify(response.data).slice(0, 200));
    persistentLogger.add(
      "error",
      "CustomProvider",
      `GET ${url} -> HTTP ${response.status}: ${errMsg}`
    );
    throw new Error(`HTTP ${response.status}: ${errMsg}`);
  }

  const data = response.data;
  const list: unknown[] = Array.isArray(data?.data)
    ? data.data
    : Array.isArray(data?.models)
    ? data.models
    : Array.isArray(data)
    ? data
    : [];

  const models: FetchedModel[] = list
    .map((m: any): FetchedModel | null => {
      if (typeof m === "string") return { id: m };
      const id = m?.id || m?.model || m?.name;
      if (!id) return null;
      const name = m?.name && m.name !== id ? String(m.name) : undefined;
      const kind =
        typeof m?.type === "string" ? m.type :
        typeof m?.task === "string" ? m.task :
        typeof m?.category === "string" ? m.category :
        typeof m?.modality === "string" ? m.modality :
        undefined;
      let pricing: FetchedModel["pricing"] | undefined;
      if (m?.pricing && typeof m.pricing === "object") {
        pricing = {
          prompt: m.pricing.prompt,
          completion: m.pricing.completion,
        };
      }
      return { id: String(id), name, kind, pricing };
    })
    .filter((m): m is FetchedModel => m !== null);

  models.sort((a, b) => a.id.localeCompare(b.id));

  persistentLogger.add(
    "debug",
    "CustomProvider",
    `GET ${url} -> ${models.length} model(s)`
  );

  return models;
}

/**
 * Реальная проверка ключа: минимальный POST /chat/completions (ping).
 * GET /models сам по себе НЕ доказывает, что chat работает.
 * Возвращает ok=true только при HTTP < 400 и непустом/успешном ответе.
 */
export async function probeCustomProviderChat(
  cfg: Pick<CustomProviderConfig, "baseUrl" | "apiKey" | "modelId" | "chatPath"> & {
    extraHeadersJson?: string;
  }
): Promise<{ ok: boolean; detail: string }> {
  if (!cfg.baseUrl?.trim()) return { ok: false, detail: "Base URL is required" };
  if (!cfg.apiKey?.trim()) return { ok: false, detail: "API key is required" };
  if (!cfg.modelId?.trim()) return { ok: false, detail: "Model id is required for chat probe" };

  const base = assertSafeProviderBaseUrl(cfg.baseUrl);
  const path = (cfg.chatPath || "/chat/completions").startsWith("/")
    ? cfg.chatPath || "/chat/completions"
    : `/${cfg.chatPath || "chat/completions"}`;
  const url = `${base}${path}`;

  let extraHeaders: Record<string, string> = {};
  if (cfg.extraHeadersJson?.trim()) {
    try {
      extraHeaders = JSON.parse(cfg.extraHeadersJson);
    } catch {
      /* ignore */
    }
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${cfg.apiKey.trim()}`,
    ...extraHeaders,
  };
  if (/anthropic/i.test(base) && !headers["x-api-key"]) {
    headers["x-api-key"] = cfg.apiKey.trim();
    headers["anthropic-version"] = headers["anthropic-version"] || "2023-06-01";
  }

  const body = buildChatBody(
    cfg.modelId.trim(),
    [{ role: "user", content: "ping" }],
    { temperature: 0, maxTokens: 1, topP: 1 },
    base
  );

  persistentLogger.add("debug", "CustomProvider", `PROBE POST ${url} model=${cfg.modelId}`);

  try {
    const response = await axios.post(url, body, {
      headers,
      timeout: 45_000,
      validateStatus: () => true,
    });

    if (response.status >= 400) {
      const errMsg =
        extractProviderErrorMessage(response.data) ||
        (typeof response.data === "string"
          ? response.data.slice(0, 200)
          : JSON.stringify(response.data || {}).slice(0, 200));
      persistentLogger.add(
        "error",
        "CustomProvider",
        `PROBE HTTP ${response.status}: ${redactSecrets(errMsg)}`
      );
      return { ok: false, detail: `HTTP ${response.status}: ${errMsg}` };
    }

    persistentLogger.add("info", "CustomProvider", `PROBE OK HTTP ${response.status}`);
    return { ok: true, detail: `chat OK (HTTP ${response.status})` };
  } catch (e: unknown) {
    logAxiosDiagnostic("CustomProvider", e, { url, method: "POST" });
    const msg =
      axios.isAxiosError(e) && !e.response
        ? `${errorMessage(e)}${e.code ? ` · code=${e.code}` : ""}`
        : errorMessage(e);
    return { ok: false, detail: msg };
  }
}
