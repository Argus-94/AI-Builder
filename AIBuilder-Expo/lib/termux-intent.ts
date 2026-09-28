/**
 * Детектор запросов, для которых обычного чата недостаточно —
 * нужна Termux-сессия (диск, pkg, сборка, zip).
 *
 * Используется мостом: чат → диалог согласия → включение Termux → агент.
 */

export type TermuxIntent = {
  needed: boolean;
  /** Короткие машинные теги причин (для лога) */
  reasons: string[];
};

/**
 * Эвристика без LLM: пути на storage, zip/apk, сборка, создание проекта,
 * запись файлов, pkg/gradle/termux.
 */
export function detectTermuxIntent(message: string): TermuxIntent {
  const t = String(message || "").trim();
  if (!t || t.length < 3) return { needed: false, reasons: [] };

  // Pure info questions about last APK/path/status — no Termux action needed
  const lower0 = t.toLowerCase();
  if (
    /(путь|шлях|path|где|де|where|куда|куди).{0,40}(apk|апк|файл|file|сохранил|зберіг|saved)/i.test(lower0) ||
    /(apk|апк).{0,30}(путь|шлях|path|где|де|where)/i.test(lower0) ||
    /^(а\s+)?(напиши|скажи|покажи|укажи|tell|show).{0,20}(путь|шлях|path)/i.test(lower0)
  ) {
    return { needed: false, reasons: ["info-query"] };
  }

  const reasons: string[] = [];
  const lower = t.toLowerCase();

  // Абсолютные пути Android / Termux
  if (
    /\/storage\/emulated\/0\//i.test(t) ||
    /\/sdcard\//i.test(t) ||
    /\/data\/data\/com\.termux\//i.test(t) ||
    /AIBuilderTermux/i.test(t)
  ) {
    reasons.push("device-path");
  }

  // Архивы и APK
  if (/\.zip\b/i.test(t) || /\.apk\b/i.test(t)) {
    reasons.push("zip-or-apk");
  }

  // Сборка / Gradle / Expo prebuild
  if (
    /\b(gradlew|assembleDebug|assembleRelease|prebuild|expo run)\b/i.test(t) ||
    /(собери|собрать|збери|збудуй|build\s+apk|compile\s+apk)/i.test(t)
  ) {
    reasons.push("build");
  }

  // Создание приложения / проекта на диск (любое пожелание, не только Hello World)
  if (
    /(создай|создать|создадим|создайте|створи|напиши|зроби|make|create)\s+.{0,80}(приложение|додаток|app|проект|project|калькулятор|calculator|hello\s*world|helloworld|игр[уаы]|таймер|timer|заметк|трекер|tracker|счётчик|счетчик|утилит|виджет|программ|android)/i.test(
      t,
    ) ||
    /(создай|создать|создадим|создайте|створи|create|make|напиши)\s+(простой\s+)?(android|expo|react\s*native)/i.test(t) ||
    /(исходн\w*\s+код|source\s+code|код\s+програ|код\s+прилож).{0,40}(калькулятор|calculator|приложение|app)/i.test(
      t,
    ) ||
    /(калькулятор|calculator).{0,30}(исходн|source|код|code)/i.test(t) ||
    /(на|под)\s+android/i.test(t) && /(создай|создать|напиши|сделай|make|create)/i.test(t)
  ) {
    reasons.push("create-app");
  }

  // Распаковка / правка архива / запись файлов
  if (
    /(распакуй|розпакуй|unzip|extract)/i.test(t) ||
    /(запиши|сохрани на диск|save to disk|write (to )?disk)/i.test(t) ||
    /(поменяй|зміни|исправь|виправ).{0,40}(в архиве|в архіві|в проекте|в проєкті|in the zip)/i.test(t)
  ) {
    reasons.push("edit-on-disk");
  }

  // Доработка уже созданного приложения (после scaffold / APK)
  if (
    /(добавь|додай|доработай|измени|поменяй|исправь|виправ|перепиши|обнови|update|refine|implement).{0,60}(кнопк|экран|activity|layout|логик|функц|таймер|timer|текст|ui\b|mainactivity|манифест|код)/i.test(t) ||
    /(пересобери|пересобери|rebuild|assemble\s*debug|заново\s+собери)/i.test(t) ||
    /(добавь|додай).{0,40}(в\s+приложен|в\s+проект|в\s+apk|to\s+the\s+app)/i.test(t)
  ) {
    reasons.push("refine-app");
  }

  // Установка пакетов / toolchain
  if (
    /\b(pkg install|sdkmanager|ndk-build|termux)\b/i.test(t) ||
    /(установи|встанови|install).{0,30}(jdk|sdk|ndk|node|pnpm|cmake|ninja)/i.test(t)
  ) {
    reasons.push("install-tools");
  }

  // Явная просьба про агента / сессию Termux
  if (
    /(termux\s*агент|termux\s*agent|в termux|у termux)/i.test(t) ||
    /(запусти в termux|выполни в termux|виконай у termux)/i.test(t)
  ) {
    reasons.push("explicit-termux");
  }

  // «Выдай архив» после создания исходников
  if (
    /(выдай|видай|дай|give me|pack).{0,30}(архив|архів|zip|archive)/i.test(t) &&
    /(код|исходник|source|проект|project|app)/i.test(t)
  ) {
    reasons.push("deliver-zip");
  }

  return { needed: reasons.length > 0, reasons };
}
