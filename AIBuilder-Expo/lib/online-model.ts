import { errorMessage, errorName } from "./error-utils";
import { persistentLogger } from "./persistent-logger";
/**
 * Онлайн-модель приложения — работает через OpenRouter (https://openrouter.ai).
 *
 * ВАЖНО (исправление ошибки "This model is unavailable for free"): раньше
 * здесь был захардкожен конкретный слаг meta-llama/llama-3.1-8b-instruct:free.
 * OpenRouter периодически снимает бесплатные модели с бесплатного тарифа или
 * полностью их выключает — именно это и произошло (см. ответ 404 от сервера).
 * Чтобы больше не чинить это вручную при каждой смене модели, используем
 * официальный бесплатный роутер OpenRouter "openrouter/free" — он сам
 * выбирает доступную бесплатную модель (включая модели с поддержкой
 * изображений, когда запрос их требует) и не имеет фиксированного слага,
 * который может устареть.
 */

export const ONLINE_MODEL = {
  id: "openrouter/free",
  name: "OpenRouter Free Router",
  provider: "OpenRouter",
  /** Условный размер контекстного окна роутера — используется только для
   *  подписи в интерфейсе (см. i18n-ключ "onlineModelContextLabel"). */
  contextLength: 200_000,
} as const;

/**
 * Список бесплатных моделей OpenRouter, доступных для ручного выбора в
 * Настройках → "Модели OpenRouter" (см. components/OpenRouterModelsDialog.tsx).
 * Первый пункт — тот же "auto"-роутер, что используется по умолчанию
 * (ONLINE_MODEL.id) — сам подбирает доступную бесплатную модель.
 *
 * ВАЖНО (v25, перепроверено по логу пользователя от 09.09.2026 и по
 * https://openrouter.ai/collections/free-models):
 *  - z-ai/glm-5.3-flash:free УДАЛЕНА — этого слага вообще нет в текущей
 *    коллекции бесплатных моделей OpenRouter, отсюда и HTTP 404 "This model
 *    is unavailable for free" в логе. Слаг был снят с бесплатного тарифа.
 *  - thinkingmachines/inkling:free и thinkingmachines/inkling-small:free
 *    УДАЛЕНЫ — формально числятся бесплатными в каталоге OpenRouter, но
 *    провайдер отдаёт их только зарегистрированным "агентным" приложениям
 *    (см. HTTP 403 "is only available on agentic harnesses" в логе);
 *    обычный чат-запрос из этого приложения принципиально не может
 *    получить ответ от этих моделей — это ограничение провайдера, а не
 *    ошибка кода, поэтому держать их в списке бессмысленно.
 *  - Добавлены модели, подтверждённо входящие в бесплатную коллекцию
 *    OpenRouter на сентябрь 2026 (обычные чат-модели, без ограничения
 *    "только агентные харнессы"): nvidia/nemotron-3-super-120b-a12b:free,
 *    nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free (с поддержкой
 *    изображений), poolside/laguna-xs-2.1:free, liquid/lfm-2.5-2.6b:free,
 *    nex-agi/nex-n2.5-mini:free — это расширяет пул кандидатов для
 *    автозамены (см. checkOpenRouterModels/recoverOnlineModel ниже), чтобы
 *    почти всегда был доступен хотя бы один рабочий вариант.
 *
 * OpenRouter регулярно меняет состав бесплатных моделей — если через
 * какое-то время какая-то из моделей ниже тоже перестанет отвечать, самый
 * надёжный вариант — оставить выбранным первый пункт ("openrouter/free"),
 * он не завязан на конкретный слаг и сам переключается на то, что доступно.
 * Актуальный список на будущее: https://openrouter.ai/collections/free-models
 */
export interface OpenRouterModelOption {
  id: string;
  name: string;
  vision: boolean;
  contextLength: number;
  /** Рекомендована для Termux-агента (code / tool-use). В UI — бейдж ★ */
  agentRecommended?: boolean;
  /** Подходит ли модель для полноценного диалога и разработки в чате AI Builder. */
  suitableForChat?: boolean;
  /** Причина, если модель не подходит или имеет существенные ограничения для чата. */
  unsuitableReason?: {
    uk: string;
    ru: string;
    en: string;
  };
}

/** Free OpenRouter. agentRecommended=true → бейдж ★ в списке моделей. */
export const FREE_OPENROUTER_MODELS: OpenRouterModelOption[] = [
  { id: "openrouter/free", name: "OpenRouter Free Router (auto)", vision: true, contextLength: 200_000, suitableForChat: true },
  { id: "cohere/north-mini-code:free", name: "Cohere North Mini Code", vision: false, contextLength: 256_000, agentRecommended: true, suitableForChat: true },
  { id: "nex-agi/nex-n2.5-mini:free", name: "Nex AGI N2.5 Mini", vision: false, contextLength: 262_144, agentRecommended: true, suitableForChat: true },
  { id: "poolside/laguna-s-2.1:free", name: "Poolside Laguna S 2.1", vision: false, contextLength: 262_144, agentRecommended: true, suitableForChat: true },
  { id: "poolside/laguna-xs-2.1:free", name: "Poolside Laguna XS 2.1", vision: false, contextLength: 262_144, agentRecommended: true, suitableForChat: true },
  { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "NVIDIA Nemotron 3 Super", vision: false, contextLength: 262_144, suitableForChat: true },
  { id: "nvidia/nemotron-3.5-lightning:free", name: "NVIDIA Nemotron 3.5 Lightning", vision: false, contextLength: 1_000_000, suitableForChat: true },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", name: "NVIDIA Nemotron 3 Ultra", vision: false, contextLength: 1_000_000, suitableForChat: true },
  { id: "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", name: "NVIDIA Nemotron 3 Nano Omni", vision: true, contextLength: 256_000, suitableForChat: true },
  {
    id: "liquid/lfm-2.5-2.6b:free",
    name: "Liquid LFM 2.5",
    vision: false,
    contextLength: 66_000,
    suitableForChat: false,
    unsuitableReason: {
      uk: "Малий контекст (66k), базова гібридна архітектура: не оптимізована для тривалого діалогу та команд розробки IDE.",
      ru: "Малый контекст (66k), базовая гибридная архитектура: не оптимизирована для длинного диалога и команд разработки IDE.",
      en: "Small context (66k), base hybrid model: not optimized for extended IDE multi-turn chat and dev commands.",
    },
  },
];

// Ключ по умолчанию — для работы "из коробки". При публикации замените на пустую строку.
// Никогда не хранить API-ключ в исходниках приложения: APK/IPA можно
// распаковать. Пользователь вводит ключ в настройках, где он сохраняется в
// SecureStore устройства. Старый ключ из предыдущей версии нужно отозвать в
// кабинете OpenRouter.
export const DEFAULT_OPENROUTER_API_KEY = "";

const OPENROUTER_CHAT_URL = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatTurnOnline {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface OnlineGenerationParams {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export const DEFAULT_ONLINE_PARAMS: OnlineGenerationParams = {
  temperature: 0.4,
  maxTokens: 1536,
  topP: 0.9,
};

// Системный промпт — по языку интерфейса приложения (см. hooks/useLLM.ts,
// который передаёт текущий useLanguage().language). Раньше был захардкожен
// по-русски (с опечаткой "Овечай" вместо "Отвечай") и не совпадал с
// выбранным языком интерфейса — именно на это жаловался пользователь.
const SYSTEM_PROMPTS: Record<"uk" | "ru" | "en", string> = {
  uk: "Ти — ШІ-асистент розробника всередині додатку AI Builder, що працює " +
    "через безкоштовний роутер OpenRouter (openrouter/free). Допомагай писати, " +
    "пояснювати і виправляти код будь-якими мовами (Java, Kotlin, XML, Smali, " +
    "C/C++ тощо), а також аналізуй надіслані зображення й скріншоти. Перед фінальною відповіддю самоперевіряй синтаксис, API та логіку; не заявляй про компіляцію або тести, якщо вони реально не виконувалися. Оформляй " +
    "код у блоках ``` із зазначенням мови. Відповідай мовою користувача.",
  ru: "Ты — ИИ-ассистент разработчика внутри приложения AI Builder, работающий " +
    "через бесплатный роутер OpenRouter (openrouter/free). Помогай писать, объяснять и " +
    "исправлять код на любых языках (Java, Kotlin, XML, Smali, C/C++ и т.д.), " +
    "а также анализируй присылаемые изображения и скриншоты. Перед финальным ответом самопроверяй синтаксис, API и логику; не утверждай, что код скомпилирован или протестирован, если это реально не выполнялось. Оформляй код в " +
    "блоках ``` с указанием языка. Отвечай на языке пользователя.",
  en: "You are an AI developer assistant inside the AI Builder app, running " +
    "via OpenRouter's free router (openrouter/free). Help write, explain, and " +
    "fix code in any language (Java, Kotlin, XML, Smali, C/C++, etc.), and " +
    "analyze any images and screenshots sent to you. Before the final answer, self-review syntax, APIs, and logic; never claim compilation or tests unless they were actually run. Format code in ``` " +
    "blocks with the language specified. Reply in the user's language.",
};

// Глобальный системный промт (см. Настройки → "Системный промт") — задаётся
// пользователем один раз и применяется как к офлайн-, так и к онлайн-модели
// (см. lib/local-model.ts, где та же логика). Если задан — дописывается
// ПОСЛЕ встроенного промта, а не заменяет его, чтобы модель не теряла базовые
// инструкции (формат кода, разбор изображений и т.д.).
function getSystemPrompt(lang: "uk" | "ru" | "en", customSystemPrompt?: string): string {
  const base = SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.uk;
  const custom = (customSystemPrompt || "").trim();
  if (!custom) return base;
  return `${base}\n\n${custom}`;
}

function buildHeaders(apiKey: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "HTTP-Referer": "https://github.com/ai-builder-app",
    "X-Title": "AI Builder",
  };
}

/**
 * Лёгкая проверка валидности OpenRouter API-ключа — без траты токенов и
 * без обращения к конкретной модели. Использует официальный эндпоинт
 * информации о ключе GET /api/v1/key (см. https://openrouter.ai/docs/api-reference/authentication),
 * который возвращает 200 с данными о ключе (лимиты/использование), если
 * ключ действителен, и 401 — если нет. Используется кнопкой "Проверить
 * ключ" в Настройках (см. app/settings.tsx).
 */
const OPENROUTER_KEY_INFO_URL = "https://openrouter.ai/api/v1/key";

export interface ApiKeyCheckResult {
  valid: boolean;
  message: string;
}

export async function validateOpenRouterApiKey(apiKey: string): Promise<ApiKeyCheckResult> {
  const key = apiKey.trim();
  if (!key) {
    return { valid: false, message: "EMPTY" };
  }
  try {
    const response = await fetch(OPENROUTER_KEY_INFO_URL, {
      method: "GET",
      headers: { Authorization: `Bearer ${key}` },
    });
    if (response.status === 401 || response.status === 403) {
      persistentLogger.add("warn", "OpenRouter", `Key check -> HTTP ${response.status} (invalid key)`);
      return { valid: false, message: `HTTP:${response.status}` };
    }
    if (!response.ok) {
      const details = await extractErrorMessage(response);
      persistentLogger.add("warn", "OpenRouter", `Key check -> HTTP ${response.status}: ${details}`);
      return { valid: false, message: `HTTP:${response.status}:${details}` };
    }
    persistentLogger.add("info", "OpenRouter", "Key check -> valid");
    return { valid: true, message: "OK" };
  } catch (err: unknown) {
    const msg = errorMessage(err);
    persistentLogger.add("error", "OpenRouter", `Key check NETWORK ${msg}`);
    return { valid: false, message: `NETWORK:${msg}` };
  }
}

async function extractErrorMessage(response: Response): Promise<string> {
  try {
    const data = await response.json();
    if (data?.error?.message) return String(data.error.message);
    return JSON.stringify(data);
  } catch {
    try {
      return await response.text();
    } catch {
      return response.statusText;
    }
  }
}

// Сообщения об ошибках ниже НЕ переведены на конкретный язык здесь —
// вместо готового русского текста бросаются короткие технические коды
// ("NO_KEY", "NETWORK:...", "HTTP:status:...", "EMPTY"). Экран/хук, который
// ловит ошибку (hooks/useLLM.ts), расшифровывает код через
// useLanguage().t(...) — так текст ошибки всегда соответствует текущему
// языку интерфейса, а не языку, который был захардкожен в момент написания
// этого файла (это и была причина "смешения языков" в интерфейсе).
function extractMessageText(data: any): string | null {
  const message = data?.choices?.[0]?.message;
  if (message) {
    const content = message?.content;
    if (typeof content === "string" && content.trim()) return content.trim();
    // Reasoning-модели часто отдают текст в reasoning / reasoning_content
    const reasoning = message?.reasoning ?? message?.reasoning_content;
    if (typeof reasoning === "string" && reasoning.trim()) return reasoning.trim();
    // Иногда content — массив частей (multimodal style)
    if (Array.isArray(content)) {
      const joined = content
        .map((p: any) => (typeof p === "string" ? p : p?.text || ""))
        .join("")
        .trim();
      if (joined) return joined;
    }
  }
  if (typeof data?.choices?.[0]?.text === "string" && data.choices[0].text.trim()) {
    return data.choices[0].text.trim();
  }
  return null;
}

async function callOpenRouterOnce(body: Record<string, unknown>, apiKey: string): Promise<string> {
  let response: Response;
  const t0 = Date.now();
  const model = typeof body.model === "string" ? body.model : "?";
  persistentLogger.add(
    "debug",
    "OpenRouter",
    `→ POST chat/completions model=${model} msgs=${Array.isArray(body.messages) ? body.messages.length : "?"}`
  );
  persistentLogger.markModelRequest(
    "OpenRouter",
    model,
    Array.isArray(body.messages) ? body.messages as Array<{ role?: string; content?: unknown }> : undefined,
    (() => { try { return JSON.stringify(body).length; } catch { return 0; } })(),
    "chat"
  );
  try {
    response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify(body),
    });
  } catch (err: unknown) {
    persistentLogger.add("error", "OpenRouter", `NETWORK ${errorMessage(err)}`);
    throw new Error(`NETWORK:${errorMessage(err)}`);
  }

  const ms = Date.now() - t0;
  if (!response.ok) {
    const details = await extractErrorMessage(response);
    persistentLogger.add(
      "warn",
      "OpenRouter",
      `← HTTP ${response.status} in ${ms}ms: ${details || response.statusText}`
    );
    throw new Error(`HTTP:${response.status}:${details || response.statusText}`);
  }

  const data = await response.json();
  const text = extractMessageText(data);
  persistentLogger.add(
    "debug",
    "OpenRouter",
    `← 200 in ${ms}ms, reply ${text ? text.length : 0} chars` +
      (text ? `:\n${text}` : " (EMPTY)"),
    "agent"
  );
  if (text) {
    persistentLogger.markModelResponse("OpenRouter", String(body?.model || "?"), text, ms);
  }
  if (!text) {
    throw new Error("EMPTY");
  }
  return text;
}

async function callOpenRouter(body: Record<string, unknown>, apiKey: string): Promise<string> {
  if (!apiKey || !apiKey.trim()) {
    throw new Error("NO_KEY");
  }
  // Free-модели часто отдают 429 "Provider returned error" — retry с backoff.
  const maxAttempts = 2;
  let lastErr: any;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await callOpenRouterOnce(body, apiKey);
    } catch (err: unknown) {
      lastErr = err;
      const msg = errorMessage(err);
      // Дневной лимит free — retry бесполезен
      if (/free-models-per-day|1000 free model requests/i.test(msg)) {
        throw err;
      }
      // Если модель недоступна (404/403) и выбрана конкретная модель (не auto-router),
      // автоматически переключаемся на ONLINE_MODEL.id (openrouter/free)
      if (
        (/HTTP:404/.test(msg) || /HTTP:403/.test(msg)) &&
        typeof body.model === "string" &&
        body.model !== ONLINE_MODEL.id
      ) {
        persistentLogger.add(
          "warn",
          "OpenRouter",
          `Model ${body.model} returned ${msg.slice(0, 80)}. Auto-failing over to ${ONLINE_MODEL.id}`
        );
        body = { ...body, model: ONLINE_MODEL.id };
        continue;
      }
      const retriable =
        /HTTP:429/.test(msg) ||
        /HTTP:503/.test(msg) ||
        msg === "EMPTY" ||
        msg.startsWith("NETWORK:");
      if (retriable && attempt < maxAttempts - 1) {
        const delay = /HTTP:429|HTTP:503/.test(msg)
          ? 1500 * (attempt + 1) * (attempt + 1)
          : 800;
        persistentLogger.add(
          "warn",
          "OpenRouter",
          `retry ${attempt + 1}/${maxAttempts - 1} after ${delay}ms (${msg.slice(0, 100)})`
        );
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      // После единственной автоматической retry попытки останавливаем workflow.
      // Никаких каскадных fallback-запросов после 429/503/network/empty.
      throw err;
    }
  }
  throw lastErr;
}

// ─────────────────────────────────────────────────────────────────────────
// Проверка работоспособности моделей OpenRouter (Настройки → "Модели
// OpenRouter" → кнопка "Проверить модели", а также автопроверка при
// запуске — см. hooks/useAppSettings.ts).
//
// ПРИЧИНА: список FREE_OPENROUTER_MODELS выше — это слаги, которые
// подтверждённо были бесплатны на момент написания кода, но OpenRouter
// регулярно меняет состав бесплатных моделей и условия доступа к ним (см.
// лог пользователя: несколько моделей отвечали 403 "is only available on
// agentic harnesses" вместо ответа в обычном чате). Простой запрос списка
// моделей (GET /models) НЕ показывает такие ограничения — модель может
// официально существовать и быть "бесплатной", но всё равно отказывать
// конкретно чат-запросам. Поэтому единственный надёжный способ понять,
// работает ли модель "прямо сейчас" — отправить ей реальный, но
// максимально дешёвый (max_tokens: 4) тестовый запрос и посмотреть на ответ.
// ─────────────────────────────────────────────────────────────────────────

// "limited" — новый статус (v25): дневной лимит бесплатных запросов
// OpenRouter исчерпан для ВСЕГО аккаунта (см. isDailyFreeLimitError ниже).
// Это отдельный статус, а НЕ "broken" — раньше эта ситуация ошибочно
// показывалась как "Не работает" для каждой модели по отдельности (именно
// это на скриншоте пользователя: 0 из 8 моделей "работает", хотя на самом
// деле ни одна модель не сломана — просто закончился общий дневной лимит).
export type OpenRouterModelStatus = "unknown" | "checking" | "working" | "broken" | "limited";

export interface OpenRouterModelCheckResult {
  id: string;
  status: "working" | "broken" | "limited";
  error?: string;
}

const MODEL_CHECK_TIMEOUT_MS = 20_000;
// Бесплатные модели OpenRouter имеют жёсткий лимит запросов в минуту на
// ключ/модель. Раньше проверка била все модели практически одновременно
// (конкурентность 2, без пауз) — из-за этого OpenRouter отвечал 429 "Too
// Many Requests" на большинство моделей, и они помечались "Не работает",
// хотя на самом деле прекрасно отвечают при обычном одиночном запросе (это
// и есть причина ошибки со скриншота: "показывает не активна, а на самом
// деле работает"). Ниже — retry с задержкой именно на 429/503, отдельный
// статус-код в ошибке и пауза между запросами, чтобы не создавать новый
// всплеск лимита при повторной попытке.
const MODEL_CHECK_MAX_RETRIES = 2;
const MODEL_CHECK_RETRY_BASE_DELAY_MS = 3_000;
const MODEL_CHECK_STAGGER_DELAY_MS = 900;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// OpenRouter отдаёт бесплатным ("...:free") моделям ДВА разных вида 429:
//  1) обычный per-minute rate limit конкретного провайдера/модели —
//     временный, повторный запрос через несколько секунд обычно проходит;
//  2) общий дневной лимит запросов аккаунта ("Rate limit exceeded:
//     free-models-per-day. Add 10 credits to unlock 1000 free model
//     requests per day") — это лимит на ВЕСЬ аккаунт сразу на все
//     бесплатные модели одновременно, и он не снимется, если подождать
//     несколько секунд или переключиться на другую модель: сбрасывается
//     только раз в сутки (или увеличивается пополнением баланса).
// Раньше оба случая обрабатывались одинаково — ретраи, а затем статус
// "broken" на КАЖДУЮ модель по отдельности. Из-за этого при исчерпанном
// дневном лимите проверка показывала "0 из N моделей работает" (см.
// скриншот/лог пользователя), хотя ни одна модель на самом деле не
// сломана. Различаем эти случаи по тексту ошибки.
function isDailyFreeLimitError(details: string): boolean {
  return typeof details === "string" && details.toLowerCase().includes("free-models-per-day");
}

/** Достаёт задержку из заголовка Retry-After (секунды или HTTP-дата), либо null. */
function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers?.get?.("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (!Number.isNaN(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

async function probeOpenRouterModel(
  modelId: string,
  apiKey: string,
  attempt: number = 0,
  maxRetries: number = MODEL_CHECK_MAX_RETRIES
): Promise<OpenRouterModelCheckResult> {
  if (!apiKey || !apiKey.trim()) {
    return { id: modelId, status: "broken", error: "NO_KEY" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), MODEL_CHECK_TIMEOUT_MS);
  try {
    const response = await fetch(OPENROUTER_CHAT_URL, {
      method: "POST",
      headers: buildHeaders(apiKey),
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "Reply with exactly: OK" }],
        // Дальше 8 токенов не хватало моделям с "рассуждением" (reasoning) —
        // они успевали потратить весь лимит на внутренние размышления и
        // возвращали пустой content, из-за чего рабочая модель ошибочно
        // помечалась как "Не работает". 32 токена даёт достаточно места и
        // на короткое рассуждение, и на сам ответ "OK".
        max_tokens: 32,
        temperature: 0,
      }),
      signal: controller.signal,
    });

    if (response.status === 429) {
      const details = await extractErrorMessage(response);
      if (isDailyFreeLimitError(details)) {
        // Общий дневной лимит — ждать и повторять здесь бессмысленно (см.
        // isDailyFreeLimitError выше), и это НЕ поломка именно этой модели.
        clearTimeout(timeoutId);
        return { id: modelId, status: "limited", error: `HTTP:429:${details}` };
      }
      // Обычный per-minute rate limit — это НЕ признак того, что модель
      // сломана, это временное ограничение частоты запросов. Ждём и
      // пробуем ещё раз, прежде чем делать вывод о неработоспособности.
      if (attempt < maxRetries) {
        const retryAfter = parseRetryAfterMs(response);
        const delay = retryAfter ?? MODEL_CHECK_RETRY_BASE_DELAY_MS * (attempt + 1);
        clearTimeout(timeoutId);
        await sleep(delay);
        return probeOpenRouterModel(modelId, apiKey, attempt + 1, maxRetries);
      }
      return { id: modelId, status: "broken", error: `HTTP:429:${details}` };
    }

    // 503 (сервис временно перегружен) — тоже не признак поломки модели.
    if (response.status === 503 && attempt < maxRetries) {
      const retryAfter = parseRetryAfterMs(response);
      const delay = retryAfter ?? MODEL_CHECK_RETRY_BASE_DELAY_MS * (attempt + 1);
      clearTimeout(timeoutId);
      await sleep(delay);
      return probeOpenRouterModel(modelId, apiKey, attempt + 1, maxRetries);
    }

    if (!response.ok) {
      const details = await extractErrorMessage(response);
      return { id: modelId, status: "broken", error: `HTTP:${response.status}:${details}` };
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const content = message?.content;
    // Некоторые бесплатные модели (в первую очередь "reasoning"-модели)
    // возвращают полезный текст не в content, а в reasoning/reasoning_content,
    // если основной ответ не успел сформироваться в пределах max_tokens.
    // Раньше проверялся только content — из-за этого рабочая модель
    // ошибочно считалась "пустым ответом" (EMPTY) и помечалась сломанной.
    const reasoning = message?.reasoning ?? message?.reasoning_content;
    const hasContent = typeof content === "string" && content.trim().length > 0;
    const hasReasoning = typeof reasoning === "string" && reasoning.trim().length > 0;
    // Если ответ пришёл без ошибки, но реального текста нет, а модель просто
    // упёрлась в лимит токенов на середине размышления (finish_reason ===
    // "length") — это тоже сигнал, что модель жива и отвечает, ей просто
    // нужно больше max_tokens в реальном чате (там по умолчанию 1536, а не 32).
    const ranOutOfBudget = data?.choices?.[0]?.finish_reason === "length";
    if (!hasContent && !hasReasoning && !ranOutOfBudget) {
      return { id: modelId, status: "broken", error: "EMPTY" };
    }
    return { id: modelId, status: "working" };
  } catch (err: unknown) {
    const isTimeout = errorName(err) === "AbortError";
    if (!isTimeout && attempt < maxRetries) {
      // Разрыв сети/таймаут соединения — тоже стоит попробовать ещё раз
      // перед тем как считать модель сломанной.
      await sleep(MODEL_CHECK_RETRY_BASE_DELAY_MS * (attempt + 1));
      return probeOpenRouterModel(modelId, apiKey, attempt + 1, maxRetries);
    }
    return { id: modelId, status: "broken", error: isTimeout ? "TIMEOUT" : String(errorMessage(err)) };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Проверяет все переданные модели и возвращает карту "id модели -> результат".
 * Auto-router тоже тестируется реальным запросом. Наличие самого слага в
 * GET /models не гарантирует доступность ответа для конкретного ключа.
 *
 * Запросы идут СТРОГО последовательно (с небольшой паузой между ними), а не
 * параллельно — параллельные запросы почти гарантированно ловят 429 от
 * бесплатного тарифа OpenRouter (лимит запросов в минуту общий на все
 * бесплатные модели), из-за чего почти весь список ошибочно помечался
 * "Не работает" сразу после нажатия "Проверить модели". Поштучная проверка
 * с задержкой чуть медленнее, но результат соответствует действительности.
 *
 * onProgress вызывается по мере готовности каждой модели — используется
 * UI-диалогом (OpenRouterModelsDialog), чтобы подсвечивать статусы по одной,
 * а не ждать полного завершения проверки всего списка.
 */
export interface CheckOpenRouterModelsOptions {
  /** Сколько раз повторить запрос при 429/503/сетевой ошибке перед тем как
   *  считать модель сломанной. По умолчанию MODEL_CHECK_MAX_RETRIES (2) —
   *  подходит для фоновой/ручной проверки в Настройках, где точность важнее
   *  скорости. Для аварийного переключения модели прямо во время чата
   *  (см. hooks/useLLM.ts → recoverOnlineModel) стоит передавать 0, чтобы не
   *  заставлять пользователя ждать ответа лишние секунды. */
  maxRetries?: number;
  /** Пауза между проверками моделей (мс), чтобы не залетать в общий
   *  rate-limit бесплатного тарифа OpenRouter. */
  staggerMs?: number;
}

export async function checkOpenRouterModels(
  models: OpenRouterModelOption[],
  apiKey: string,
  onProgress?: (result: OpenRouterModelCheckResult) => void,
  options?: CheckOpenRouterModelsOptions
): Promise<Record<string, OpenRouterModelCheckResult>> {
  const results: Record<string, OpenRouterModelCheckResult> = {};
  const maxRetries = options?.maxRetries ?? MODEL_CHECK_MAX_RETRIES;
  const staggerMs = options?.staggerMs ?? MODEL_CHECK_STAGGER_DELAY_MS;

  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    const result = await probeOpenRouterModel(model.id, apiKey, 0, maxRetries);
    results[model.id] = result;
    onProgress?.(result);

    if (result.status === "limited") {
      // Дневной лимит бесплатных запросов исчерпан для ВСЕГО аккаунта —
      // проверять остальные модели дальше бессмысленно (результат будет
      // тем же для любой из них) и только тратит время пользователя.
      // Модели, которые ещё не успели проверить в этом раунде, просто не
      // попадут в results — вызывающий код (см. hooks/useAppSettings.ts)
      // объединяет новый результат с уже известными статусами, а не
      // затирает их, так что их прежний статус не потеряется.
      break;
    }

    if (i < models.length - 1 && staggerMs > 0) {
      await sleep(staggerMs);
    }
  }

  return results;
}

class OnlineModelEngine {
  async chat(
    history: ChatTurnOnline[],
    apiKey: string,
    gen: OnlineGenerationParams = DEFAULT_ONLINE_PARAMS,
    lang: "uk" | "ru" | "en" = "uk",
    customSystemPrompt?: string,
    modelId: string = ONLINE_MODEL.id
  ): Promise<string> {
    return callOpenRouter(
      {
        model: modelId,
        messages: [{ role: "system", content: getSystemPrompt(lang, customSystemPrompt) }, ...history],
        temperature: gen.temperature,
        max_tokens: gen.maxTokens,
        top_p: gen.topP,
      },
      apiKey
    );
  }

  async analyzeImage(
    imageDataUrl: string,
    prompt: string,
    apiKey: string,
    gen: OnlineGenerationParams = DEFAULT_ONLINE_PARAMS,
    lang: "uk" | "ru" | "en" = "uk",
    customSystemPrompt?: string,
    modelId: string = ONLINE_MODEL.id
  ): Promise<string> {
    return callOpenRouter(
      {
        model: modelId,
        messages: [
          { role: "system", content: getSystemPrompt(lang, customSystemPrompt) },
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        temperature: gen.temperature,
        max_tokens: gen.maxTokens,
        top_p: gen.topP,
      },
      apiKey
    );
  }
}

export const onlineModelEngine = new OnlineModelEngine();
