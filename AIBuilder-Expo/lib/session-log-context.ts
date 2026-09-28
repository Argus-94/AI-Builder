import { persistentLogger, type LogEntry } from "./persistent-logger";

/**
 * Подбирает из persistent-лога записи, релевантные текущему запросу
 * пользователя. Нужно, чтобы при длинной сессии (история чата обрезается
 * ради токенов) модель всё равно «подсматривала» ранние шаги: созданные
 * файлы, пути, команды Termux, ответы ассистента — без протаскивания
 * всей истории в каждый запрос.
 *
 * Стратегия:
 *  1. Из сообщения вытаскиваем токены (пути, имена файлов, слова ≥3 символов).
 *  2. Скоринг записей лога по совпадениям.
 *  3. Берём топ по score, укладываемся в maxChars.
 */

const STOP = new Set([
  "the", "and", "for", "that", "this", "with", "from", "your", "have", "not",
  "are", "was", "were", "что", "это", "как", "для", "или", "при", "все",
  "его", "её", "их", "мне", "тебя", "нужно", "можешь", "пожалуйста",
  "будь", "ласка", "тоже", "ещё", "еще", "только", "сейчас", "файл",
  "the", "a", "an", "to", "of", "in", "on", "is", "it", "you", "me",
  "удали", "создай", "сделай", "покажи", "найди", "открой", "закрой",
  "please", "just", "make", "create", "delete", "show", "find", "open",
]);

function extractTokens(text: string): string[] {
  const raw = text
    .toLowerCase()
    .match(/[a-zа-яё0-9_./~-]{3,}/gi) || [];
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const t of raw) {
    const s = t.toLowerCase();
    if (STOP.has(s)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    tokens.push(s);
    // имя файла из пути
    if (s.includes("/")) {
      const base = s.split("/").pop();
      if (base && base.length >= 3 && !seen.has(base)) {
        seen.add(base);
        tokens.push(base);
      }
    }
  }
  return tokens.slice(0, 24);
}

function scoreEntry(entry: LogEntry, tokens: string[]): number {
  if (tokens.length === 0) return 0;
  const hay = `${entry.tag} ${entry.message}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    if (hay.includes(t)) {
      score += t.includes("/") || t.includes(".") ? 3 : 1;
    }
  }
  // Termux/Chat чуть приоритетнее общих записей
  if (entry.tag === "Termux" || entry.tag === "Chat") score *= 1.4;
  if (entry.level === "error") score *= 1.1;
  return score;
}

export function buildRelevantSessionLogContext(
  userMessage: string,
  options?: { maxChars?: number; maxEntries?: number }
): string {
  const maxChars = options?.maxChars ?? 2800;
  const maxEntries = options?.maxEntries ?? 18;
  const tokens = extractTokens(userMessage);
  if (tokens.length === 0) return "";

  const all = persistentLogger.getAll();
  if (all.length === 0) return "";

  const ranked = all
    .map((e) => ({ e, score: scoreEntry(e, tokens) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.e.timestamp - a.e.timestamp)
    .slice(0, maxEntries)
    // хронологический порядок для читаемости моделью
    .sort((a, b) => a.e.timestamp - b.e.timestamp);

  if (ranked.length === 0) return "";

  const lines: string[] = [];
  let used = 0;
  for (const { e } of ranked) {
    const ts = new Date(e.timestamp).toISOString().slice(11, 19);
    const line = `[${ts}] [${e.tag}] ${e.message}`.replace(/\s+/g, " ").trim();
    if (used + line.length + 1 > maxChars) break;
    lines.push(line);
    used += line.length + 1;
  }

  if (lines.length === 0) return "";
  return (
    "[SESSION_LOG — релевантные записи лога этой сессии; используй, если в недавней истории чата не хватает деталей]\n" +
    lines.join("\n")
  );
}
