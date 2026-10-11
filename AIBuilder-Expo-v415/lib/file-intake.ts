/** Local-first attachment intake, safe inspection and dynamic action resolution. */
import { File } from "expo-file-system";
import type { AttachmentType, ChatAttachment } from "./multimodal-types";
import { detectAttachmentType } from "./file-parser-registry";
import { persistentLogger } from "./persistent-logger";

export interface ArchiveInspection {
  format: "zip" | "apk" | "aab" | "archive";
  safe: boolean;
  entryCount: number;
  totalUncompressedBytes: number;
  projectType?: "android" | "expo" | "generic";
  keyFiles: string[];
  warnings: string[];
}

export interface FileAnalysisSession {
  attachmentId: string;
  filename: string;
  mime: string;
  size: number;
  extension: string;
  detectedType: AttachmentType;
  textLike: boolean;
  archive?: ArchiveInspection;
  manifest?: Record<string, unknown>;
  availableActions: FileAction[];
  selectedAction?: string;
  analysisState: "READY" | "ERROR";
  error?: string;
  createdAt: number;
}

export interface FileAction { id: string; label: string; prompt: string; }

const MAX_ARCHIVE_ENTRIES = 100_000;
const MAX_ARCHIVE_UNCOMPRESSED = 2 * 1024 * 1024 * 1024;
const MAX_COMPRESSION_RATIO = 1000;
const sessionCache = new Map<string, FileAnalysisSession>();
const TEXT_EXTS = /^(txt|md|json|xml|yaml|yml|toml|ini|properties|gradle|kts|java|kt|js|ts|tsx|jsx|py|c|cpp|h|hpp|rs|go|sh|css|scss|less|sql|log|conf)$/i;

function isUnsafePath(name: string): boolean {
  const n = name.replace(/\\/g, "/");
  return n.startsWith("/") || /^[A-Za-z]:\//.test(n) || n.split("/").some(p => p === "..") || n.includes("\0");
}

function readU16(v: DataView, o: number) { return v.getUint16(o, true); }
function readU32(v: DataView, o: number) { return v.getUint32(o, true); }

/** Inspects ZIP central-directory metadata without extracting files. */
function inspectZip(bytes: Uint8Array, type: "zip" | "apk" | "aab"): ArchiveInspection {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const keyFiles: string[] = [];
  const warnings: string[] = [];
  let entryCount = 0;
  let totalUncompressedBytes = 0;
  let totalCompressedBytes = 0;
  let projectType: ArchiveInspection["projectType"];

  for (let i = 0; i + 46 <= bytes.length; i++) {
    if (readU32(view, i) !== 0x02014b50) continue;
    entryCount++;
    if (entryCount > MAX_ARCHIVE_ENTRIES) {
      warnings.push(`entry-count exceeds ${MAX_ARCHIVE_ENTRIES}`);
      return { format: type, safe: false, entryCount, totalUncompressedBytes, projectType, keyFiles, warnings };
    }
    const compressed = readU32(view, i + 20);
    const uncompressed = readU32(view, i + 24);
    const nameLen = readU16(view, i + 28);
    const extraLen = readU16(view, i + 30);
    const commentLen = readU16(view, i + 32);
    const attr = readU32(view, i + 38);
    const start = i + 46;
    const end = start + nameLen;
    if (end > bytes.length) { warnings.push("truncated central-directory entry"); break; }
    const nameBytes = bytes.slice(start, end);
    let name = "";
    // ASCII-compatible decoding is sufficient for safety checks; path traversal
    // markers are ASCII and therefore cannot be hidden by UTF-8 filenames.
    name = Array.from(nameBytes).map(x => String.fromCharCode(x)).join("");
    if (isUnsafePath(name)) warnings.push(`unsafe archive path: ${name.slice(0, 180)}`);
    const unixMode = attr >>> 16;
    const fileType = unixMode & 0xF000;
    if (fileType === 0xA000 || fileType === 0x6000) warnings.push(`link/special archive member: ${name.slice(0, 180)}`);
    totalCompressedBytes += compressed;
    totalUncompressedBytes += uncompressed;
    if (totalUncompressedBytes > MAX_ARCHIVE_UNCOMPRESSED) warnings.push(`declared extracted size exceeds ${MAX_ARCHIVE_UNCOMPRESSED} bytes`);
    if (compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO) warnings.push(`compression ratio too high: ${name.slice(0, 120)}`);
    if (keyFiles.length < 80 && /(?:^|\/)(settings\.gradle(?:\.kts)?|build\.gradle(?:\.kts)?|gradle\.properties|AndroidManifest\.xml|app\/build\.gradle(?:\.kts)?|package\.json|app\.config\.(?:js|ts))$/i.test(name)) keyFiles.push(name);
    if (/^AndroidManifest\.xml$/i.test(name) || /(^|\/)AndroidManifest\.xml$/i.test(name)) projectType = "android";
    if (/^app\.config\.(?:js|ts)$/i.test(name) || /(^|\/)app\.json$/i.test(name)) projectType = projectType === "android" ? "android" : "expo";
    i = end + extraLen + commentLen - 1;
  }
  if (!entryCount) warnings.push("ZIP central directory not found or unreadable");
  if (totalCompressedBytes > 0 && totalUncompressedBytes / totalCompressedBytes > MAX_COMPRESSION_RATIO) warnings.push("archive-wide compression ratio is too high");
  return { format: type, safe: warnings.length === 0, entryCount, totalUncompressedBytes, projectType, keyFiles, warnings };
}

function actionsFor(type: AttachmentType, archive?: ArchiveInspection): FileAction[] {
  switch (type) {
    case "ARCHIVE":
      if (archive?.format === "apk") return [
        { id: "apk-analyze", label: "Проанализировать APK", prompt: "Проанализируй APK: package/version, manifest, permissions, компоненты, ABI/native libs и доступные ресурсы." },
        { id: "apk-manifest", label: "Manifest / permissions", prompt: "Проверь AndroidManifest и permissions APK, перечисли важные компоненты и риски." },
        { id: "apk-libs", label: "Найти библиотеки", prompt: "Найди и перечисли библиотеки и native ABI в APK, если данные доступны." },
        { id: "apk-security", label: "Проверить безопасность", prompt: "Проверь APK на типовые проблемы безопасности и приведи доказательства из файлов." },
        { id: "apk-resources", label: "Извлечь ресурсы", prompt: "Опиши доступные ресурсы APK и что можно безопасно извлечь/проанализировать." },
      ];
      if (archive?.projectType === "android" || archive?.projectType === "expo") return [
        { id: "project-analyze", label: "Проанализировать проект", prompt: "Проанализируй проект по структуре и ключевым файлам, без изменения файлов." },
        { id: "project-errors", label: "Найти ошибки", prompt: "Найди ошибки и потенциальные проблемы в исходном проекте, указывая конкретные файлы." },
        { id: "project-build", label: "Проверить сборку", prompt: "Проверь готовность проекта к сборке и найди возможные причины ошибки сборки." },
        { id: "project-security", label: "Проверить безопасность", prompt: "Проверь проект на секреты, опасные shell/file операции, permissions и path traversal." },
        { id: "project-structure", label: "Показать структуру", prompt: "Покажи компактную структуру проекта и ключевые файлы с пояснениями." },
      ];
      return [{ id: "file-analyze", label: "Проанализировать файл", prompt: "Проанализируй прикреплённый архив безопасно и опиши его структуру и содержимое." }];
    case "PDF": return [
      { id: "pdf-summary", label: "Краткое содержание", prompt: "Сделай краткое содержание PDF на основе реально извлечённого текста." },
      { id: "pdf-detail", label: "Подробный анализ", prompt: "Сделай подробный анализ PDF с указанием разделов и доступных данных." },
      { id: "pdf-info", label: "Найти информацию", prompt: "Найди в PDF ключевую информацию, относящуюся к моему запросу." },
      { id: "pdf-tables", label: "Извлечь таблицы", prompt: "Найди и извлеки таблицы из PDF, если они доступны." },
      { id: "pdf-check", label: "Проверить документ", prompt: "Проверь PDF на структурные проблемы и явно укажи, что удалось прочитать." },
    ];
    case "SPREADSHEET": return [
      { id: "sheet-analyze", label: "Проанализировать данные", prompt: "Проанализируй таблицу: листы, размеры, заголовки, типы данных и основные закономерности." },
      { id: "sheet-errors", label: "Найти ошибки", prompt: "Найди потенциальные ошибки и аномалии в таблице." },
      { id: "sheet-summary", label: "Сводка", prompt: "Сделай компактную сводку таблицы." },
      { id: "sheet-stats", label: "Статистика", prompt: "Рассчитай доступную описательную статистику таблицы." },
      { id: "sheet-formulas", label: "Проверить формулы", prompt: "Проверь формулы и укажи подозрительные или ошибочные места, если они доступны." },
    ];
    case "IMAGE": return [
      { id: "image-describe", label: "Описать", prompt: "Опиши изображение." },
      { id: "image-ocr", label: "Найти текст", prompt: "Извлеки видимый текст с изображения." },
      { id: "image-ui", label: "Проанализировать интерфейс", prompt: "Проанализируй изображение как UI screenshot." },
      { id: "image-bugs", label: "Найти визуальные ошибки", prompt: "Найди визуальные ошибки, проблемы компоновки, отступов и кнопок." },
    ];
    case "DOCUMENT": return [
      { id: "doc-summary", label: "Краткое содержание", prompt: "Сделай краткое содержание документа на основе реально извлечённого текста." },
      { id: "doc-detail", label: "Подробный анализ", prompt: "Сделай подробный анализ документа." },
      { id: "doc-check", label: "Проверить документ", prompt: "Проверь документ на структурные проблемы и доступность текста." },
      { id: "doc-translate", label: "Перевести", prompt: "Переведи документ, сохраняя структуру насколько это возможно." },
    ];
    case "SOURCE_CODE": return [
      { id: "code-analyze", label: "Проанализировать код", prompt: "Проанализируй код и его архитектуру." },
      { id: "code-errors", label: "Найти ошибки", prompt: "Найди ошибки в коде с указанием файлов и строк, где возможно." },
      { id: "code-security", label: "Проверить безопасность", prompt: "Проверь код на типовые проблемы безопасности." },
    ];
    case "TEXT": case "JSON": case "XML": return [
      { id: "text-analyze", label: "Проанализировать", prompt: "Проанализируй файл." },
      { id: "text-errors", label: "Найти ошибки", prompt: "Найди ошибки или подозрительные места в файле." },
      { id: "text-structure", label: "Показать структуру", prompt: "Опиши структуру и ключевые части файла." },
    ];
    default: return [{ id: "file-analyze", label: "Проанализировать файл", prompt: "Проанализируй прикреплённый файл безопасно." }];
  }
}

export function isBroadAttachmentIntent(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  return !p || /^(проанализируй|посмотри|что тут|проверь|разбери|analyze|inspect|review|check|what is this)[.!?\s]*$/i.test(p);
}

export async function inspectAttachmentLocally(attachment: ChatAttachment): Promise<FileAnalysisSession> {
  const cached = sessionCache.get(attachment.id);
  if (cached) {
    persistentLogger.add("debug", "FileIntake", `CACHE_HIT attachment=${attachment.id} file=${attachment.displayName}`);
    return cached;
  }
  const started = Date.now();
  const ext = attachment.extension.toLowerCase();
  const size = attachment.sizeBytes || 0;
  const detectedType = detectAttachmentType(attachment.displayName, attachment.mimeType);
  const session: FileAnalysisSession = {
    attachmentId: attachment.id, filename: attachment.displayName, mime: attachment.mimeType, size, extension: ext,
    detectedType, textLike: TEXT_EXTS.test(ext) || detectedType === "TEXT" || detectedType === "SOURCE_CODE" || detectedType === "JSON" || detectedType === "XML",
    availableActions: [], analysisState: "READY", createdAt: Date.now(),
  };
  try {
    if (size > 100 * 1024 * 1024) throw new Error("file exceeds 100 MB local-inspection limit");
    // Verify common magic bytes before model access. Extension/MIME is only a hint.
    {
      const file = new File(attachment.uri);
      const buffer = await file.arrayBuffer();
      const b = new Uint8Array(buffer).slice(0, 16);
      const ascii = (start: number, value: string) => value.split("").every((ch, i) => b[start + i] === ch.charCodeAt(0));
      const magicType =
        ascii(0, "%PDF-") ? "PDF" :
        (b[0] === 0x89 && ascii(1, "PNG")) ? "IMAGE" :
        ascii(0, "GIF8") ? "IMAGE" :
        (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) ? "IMAGE" :
        (ascii(0, "RIFF") && ascii(8, "WEBP")) ? "IMAGE" :
        (ascii(0, "PK\x03\x04") || ascii(0, "PK\x05\x06") || ascii(0, "PK\x07\x08")) ? "ARCHIVE" :
        undefined;
      if (magicType && detectedType !== magicType && !(detectedType === "DOCUMENT" && magicType === "ARCHIVE") && !(detectedType === "SPREADSHEET" && magicType === "ARCHIVE")) {
        persistentLogger.add("warn", "FileIntake", `MAGIC_MISMATCH name=${attachment.displayName} extensionType=${detectedType} magicType=${magicType}`);
        session.manifest = { ...(session.manifest || {}), magicType };
      } else {
        session.manifest = { ...(session.manifest || {}), magicType: magicType || "unknown" };
      }
    }
    if (detectedType === "ARCHIVE" && /^(zip|apk|aab)$/i.test(ext)) {
      const file = new File(attachment.uri);
      const buffer = await file.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const magic = bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07) && (bytes[3] === 0x04 || bytes[3] === 0x06 || bytes[3] === 0x08);
      if (!magic) throw new Error("archive magic bytes do not match ZIP");
      session.archive = inspectZip(bytes, ext.toLowerCase() as "zip" | "apk" | "aab");
      if (!session.archive.safe) session.analysisState = "ERROR";
      persistentLogger.add(session.archive.safe ? "info" : "error", "FileIntake", `ARCHIVE_INSPECT ${attachment.displayName} entries=${session.archive.entryCount} extracted=${session.archive.totalUncompressedBytes} safe=${session.archive.safe} warnings=${session.archive.warnings.join(" | ")}`);
    }
    session.availableActions = actionsFor(detectedType, session.archive);
    persistentLogger.add("info", "FileIntake", `READY name=${attachment.displayName} type=${detectedType} mime=${attachment.mimeType} size=${size} actions=${session.availableActions.map(a => a.id).join(",") || "none"} durationMs=${Date.now() - started}`);
    sessionCache.set(attachment.id, session);
    return session;
  } catch (e: unknown) {
    session.analysisState = "ERROR";
    session.error = e instanceof Error ? e.message : String(e);
    session.availableActions = [];
    persistentLogger.add("error", "FileIntake", `PRE_ANALYSIS_FAILED name=${attachment.displayName} type=${detectedType} error=${session.error}`);
    return session;
  }
}
