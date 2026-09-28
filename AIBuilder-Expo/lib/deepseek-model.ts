import { errorMessage } from "./error-utils";
/**
 * DeepSeek API интеграция для AI Builder.
 * 
 * DeepSeek-V3 - быстрая и дешевая мультимодальная модель.
 * Совместима с текстом и изображениями, как OpenRouter.
 * 
 * API: https://api.deepseek.com/
 * Документация: https://platform.deepseek.com/docs
 */

import axios, { AxiosError } from "axios";
import { persistentLogger } from "./persistent-logger";

/** Параметры модели DeepSeek */
export const DEEPSEEK_MODEL = {
  id: "deepseek-chat",
  name: "DeepSeek-V3",
  description: "DeepSeek-V3: быстрая и дешевая мультимодальная модель",
  contextWindow: 64000,
  visionSupport: true,
} as const;

/** Параметры генерации для DeepSeek */
export interface DeepSeekGenerationParams {
  temperature: number;
  maxTokens: number;
  topP: number;
}

export const DEFAULT_DEEPSEEK_PARAMS: DeepSeekGenerationParams = {
  temperature: 0.7,
  maxTokens: 2048,
  topP: 0.95,
};

/** Структура сообщения для API */
interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string | ContentBlock[];
}

interface ContentBlock {
  type: "text" | "image_url";
  text?: string;
  image_url?: {
    url: string;
  };
}

/** Результат запроса к DeepSeek */
interface DeepSeekResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * DeepSeek API клиент.
 * Использует api-ключ из Secure Store.
 */
export class DeepSeekEngine {
  private apiKey: string = "";
  private baseUrl = "https://api.deepseek.com/v1";
  private isReady = false;

  constructor(apiKey: string = "") {
    this.apiKey = apiKey;
    this.isReady = !!apiKey;
  }

  /** Установить API-ключ */
  setApiKey(key: string): void {
    this.apiKey = key;
    this.isReady = !!key;
  }

  /** Проверить готовность */
  getReady(): boolean {
    return this.isReady && !!this.apiKey;
  }

  /**
   * Отправить чат-запрос к DeepSeek.
   * Поддерживает текст и изображения.
   */
  async chat(
    messages: ChatMessage[],
    params: DeepSeekGenerationParams = DEFAULT_DEEPSEEK_PARAMS
  ): Promise<string> {
    if (!this.getReady()) {
      throw new Error("DeepSeek: API-ключ не установлен");
    }

    try {
      const requestBody = {
        model: DEEPSEEK_MODEL.id,
        messages,
        temperature: Math.max(0, Math.min(2, params.temperature)),
        max_tokens: Math.max(100, Math.min(64000, params.maxTokens)),
        top_p: Math.max(0, Math.min(1, params.topP)),
        stream: false,
      };
      persistentLogger.markModelRequest(
        "DeepSeek", DEEPSEEK_MODEL.id, messages as Array<{ role?: string; content?: unknown }>,
        (() => { try { return JSON.stringify(requestBody).length; } catch { return 0; } })(), "chat"
      );
      const response = await axios.post<DeepSeekResponse>(
        `${this.baseUrl}/chat/completions`,
        requestBody,
        {
          headers: {
            "Authorization": `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 60000,
        }
      );

      const choice = response.data.choices?.[0];
      const message = choice?.message;
      const content =
        (typeof message?.content === "string" && message.content.trim() ? message.content : undefined) ||
        (typeof (message as any)?.reasoning_content === "string" && (message as any).reasoning_content.trim() ? (message as any).reasoning_content : undefined);
      if (!content) {
        throw new Error("DeepSeek: пустой ответ");
      }
      persistentLogger.markModelResponse("DeepSeek", DEEPSEEK_MODEL.id, content);
      return content;
    } catch (error: unknown) {
      const axiosError = error as AxiosError;
      const responseData = axiosError.response?.data as any;
      const serverMsg = responseData?.error?.message || responseData?.message || (typeof responseData === "string" ? responseData : "");
      
      if (axiosError.response?.status === 401) {
        throw new Error(`DeepSeek: неверный API-ключ (401)${serverMsg ? `: ${serverMsg}` : ""}`);
      }
      
      if (axiosError.response?.status === 429) {
        throw new Error(`DeepSeek: лимит запросов (429)${serverMsg ? `: ${serverMsg}` : ""}`);
      }
      
      if (axiosError.response?.status === 500) {
        throw new Error(`DeepSeek: ошибка сервера (500)${serverMsg ? `: ${serverMsg}` : ""}`);
      }
      
      if (axiosError.code === "ECONNABORTED") {
        throw new Error("DeepSeek: timeout (60 сек)");
      }
      
      if (!axiosError.response) {
        throw new Error(`DeepSeek: нет соединения (${axiosError.message})`);
      }
      
      throw new Error(`DeepSeek API: ${axiosError.response.status}${serverMsg ? ` (${serverMsg})` : ""}`);
    }
  }

  /**
   * Анализ изображения.
   * Отправить изображение и получить описание.
   */
  async analyzeImage(
    imageUri: string,
    prompt: string = "Опиши это изображение подробно."
  ): Promise<string> {
    if (!this.getReady()) {
      throw new Error("DeepSeek: API-ключ не установлен");
    }

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: [
          {
            type: "text",
            text: prompt,
          },
          {
            type: "image_url",
            image_url: {
              url: imageUri, // base64 или URL
            },
          },
        ],
      },
    ];

    return this.chat(messages);
  }

  /**
   * Проверить статус API.
   */
  async checkStatus(): Promise<{ available: boolean; latency: number }> {
    if (!this.getReady()) {
      return { available: false, latency: 0 };
    }

    try {
      const start = Date.now();
      await this.chat(
        [{ role: "user", content: "ping" }],
        { temperature: 0.5, maxTokens: 10, topP: 0.9 }
      );
      const latency = Date.now() - start;
      return { available: true, latency };
    } catch (error) {
      return { available: false, latency: 0 };
    }
  }
}

/** Глобальный экземпляр DeepSeek движка */
export const deepseekModelEngine = new DeepSeekEngine();

/** Перевести ошибку DeepSeek в читаемый формат */
export function translateDeepSeekError(error: unknown): string {
  if (error instanceof Error) {
    if (error.message.includes("API-ключ")) return "Ключ DeepSeek не установлен";
    if (error.message.includes("401")) return "Неверный ключ DeepSeek";
    if (error.message.includes("429")) return "Лимит запросов DeepSeek";
    if (error.message.includes("timeout")) return "Таймаут запроса";
    if (error.message.includes("соединение")) return "Нет интернета";
    return error.message;
  }
  return "Ошибка DeepSeek";
}
