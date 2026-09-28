export type AboutLang = "uk" | "ru" | "en";

export interface AboutBlock {
  id: string;
  title: Record<AboutLang, string>;
  body: Record<AboutLang, string>;
}

/**
 * «О приложении» — полный обзор для пользователя (v1.6.29+).
 * Простым языком: что это, с чего начать, куда нажимать.
 */
export const ABOUT_BLOCKS: AboutBlock[] = [
  {
    id: "intro",
    title: {
      uk: "Що таке AI Builder",
      ru: "Что такое AI Builder",
      en: "What is AI Builder",
    },
    body: {
      uk: "Це помічник розробника прямо на Android-телефоні.\n\n• Пишете в чат — модель допомагає з кодом, ідеями, збіркою APK.\n• Можна працювати онлайн (OpenRouter, кастомні API) або офлайн (GGUF-модель у пам’яті телефону).\n• Є сесія Termux на пристрої, екран «Середовище» (Runtime) для Debian/контейнерів, Health, backup.\n• Комп’ютер не обов’язковий: багато сценаріїв закриваються з телефону.",
      ru: "Это помощник разработчика прямо на Android-телефоне.\n\n• Пишете в чат — модель помогает с кодом, идеями, сборкой APK.\n• Можно работать онлайн (OpenRouter, свои API) или офлайн (GGUF-модель в памяти телефона).\n• Есть сессия Termux на устройстве, экран «Среда» (Runtime) для Debian/контейнеров, Health, backup.\n• Компьютер не обязателен: многие сценарии закрываются с телефона.",
      en: "A developer assistant that runs on your Android phone.\n\n• Chat with a model about code, ideas, and APK builds.\n• Work online (OpenRouter, custom APIs) or offline (a GGUF model in device RAM).\n• On-device Termux, a Runtime screen for Debian/containers, Health checks, and backups.\n• A PC is optional — many flows work from the phone alone.",
    },
  },
  {
    id: "first-run",
    title: {
      uk: "Перший запуск — 5 кроків",
      ru: "Первый запуск — 5 шагов",
      en: "First launch — 5 steps",
    },
    body: {
      uk: "1) Відкрийте меню (☰) → Налаштування.\n2) Оберіть мову й тему, якщо потрібно.\n3) Вирішіть, чим користуватись:\n   • онлайн — зазвичай уже є ключ OpenRouter «з коробки»; або свій API у «Кастомний №1 / №2»;\n   • офлайн — скачайте або імпортуйте GGUF, потім «Завантажити в пам’ять».\n4) Увімкніть потрібний режим галочкою «Використовувати як активну модель».\n5) Поверніться в Чат і напишіть перше повідомлення.\n\nДокладно кожен пункт — у «Довідка по налаштуваннях».",
      ru: "1) Откройте меню (☰) → Настройки.\n2) При желании выберите язык и тему.\n3) Решите, чем пользоваться:\n   • онлайн — часто ключ OpenRouter уже подставлен; или свой API в «Кастомный №1 / №2»;\n   • офлайн — скачайте или импортируйте GGUF, затем «Загрузить в память».\n4) Включите нужный режим галочкой «Использовать как активную модель».\n5) Вернитесь в Чат и напишите первое сообщение.\n\nПодробно каждый пункт — в «Справка по настройкам».",
      en: "1) Open the menu (☰) → Settings.\n2) Set language and theme if you want.\n3) Choose how to work:\n   • online — OpenRouter is often pre-filled; or use Custom #1 / #2 for your own API;\n   • offline — download or import a GGUF, then “Load into memory”.\n4) Tick “Use as active model” on the mode you need.\n5) Go back to Chat and send the first message.\n\nEvery step is detailed in the Settings guide.",
    },
  },
  {
    id: "chat",
    title: {
      uk: "Чат і сесії",
      ru: "Чат и сессии",
      en: "Chat & sessions",
    },
    body: {
      uk: "• Звичайний чат з історією; можна прикріпити текст і зображення.\n• Кілька чатів; назва з’являється з першого повідомлення.\n• Якщо увімкнена Termux-сесія — модель може виконувати команди в Termux: у чат приходить підсумок, деталі — у консолі Termux і в Логу.\n• Короткі «привіт / що вмієш» не запускають довгий агентний цикл.",
      ru: "• Обычный чат с историей; можно прикрепить текст и изображения.\n• Несколько чатов; название берётся из первого сообщения.\n• Если включена Termux-сессия — модель может выполнять команды в Termux: в чат приходит итог, подробности — в консоли Termux и в Логе.\n• Короткие «привет / что умеешь» не запускают длинный агентный цикл.",
      en: "• Normal chat with history; attach text and images when needed.\n• Multiple chats; the title comes from the first message.\n• With Termux session on, the model can run Termux commands: chat gets a summary, details go to the Termux console and the Log.\n• Short “hi / what can you do” does not start a long agent loop.",
    },
  },
  {
    id: "models",
    title: {
      uk: "Моделі: онлайн і офлайн",
      ru: "Модели: онлайн и офлайн",
      en: "Models: online & offline",
    },
    body: {
      uk: "Онлайн\n• OpenRouter — каталог моделей, ключ у Налаштуваннях.\n• Кастомний №1 і №2 — будь-який OpenAI-сумісний API (Base URL, Model ID, ключ). Обидва слоти порожні за замовчуванням: заповнюєте самі.\n• OpenCode — окремий пресет шлюзу.\n\nОфлайн\n• GGUF у пам’яті телефону (без інтернету після завантаження).\n• Режим «Авто (телефон + модель)» підбирає n_ctx, потоки CPU і параметри генерації за ОЗП і розміром/квантом файлу.\n• Поки модель у пам’яті — у шторці sticky-сповіщення; кнопка «Вивантажити з пам’яті» знімає її й звільняє RAM.",
      ru: "Онлайн\n• OpenRouter — каталог моделей, ключ в Настройках.\n• Кастомный №1 и №2 — любой OpenAI-совместимый API (Base URL, Model ID, ключ). Оба слота по умолчанию пустые: заполняете сами.\n• OpenCode — отдельный пресет шлюза.\n\nОфлайн\n• GGUF в памяти телефона (без интернета после загрузки).\n• Режим «Авто (телефон + модель)» подбирает n_ctx, потоки CPU и параметры генерации по ОЗУ и размеру/кванту файла.\n• Пока модель в памяти — в шторке sticky-уведомление; кнопка «Выгрузить из памяти» снимает его и освобождает RAM.",
      en: "Online\n• OpenRouter — model catalog; key in Settings.\n• Custom #1 and #2 — any OpenAI-compatible API (Base URL, Model ID, key). Both slots start empty for you to fill.\n• OpenCode — a dedicated gateway preset.\n\nOffline\n• GGUF in phone RAM (no network after download).\n• “Auto (device + model)” tunes n_ctx, CPU threads and generation from RAM and file size/quant.\n• While the model is loaded, a sticky notification stays in the shade; “Unload from memory” clears it and frees RAM.",
    },
  },
  {
    id: "termux",
    title: {
      uk: "Termux і агент",
      ru: "Termux и агент",
      en: "Termux & agent",
    },
    body: {
      uk: "Termux — окремий додаток на телефоні. AI Builder підключається до нього через офіційний міст (не вбудовує ядро Termux у себе).\n\n• У Налаштуваннях Termux увімкніть сесію, якщо потрібні команди в shell.\n• Агент може ставити пакети, збирати проєкти, читати логи — у межах політики безпеки.\n• Script Runner / ремонт: лише allowlisted-рецепти, не довільний «злий» shell з моделі.\n• Докладно: Налаштування Termux + розділ у довідці.",
      ru: "Termux — отдельное приложение на телефоне. AI Builder подключается к нему через официальный мост (не встраивает ядро Termux в себя).\n\n• В настройках Termux включите сессию, если нужны команды в shell.\n• Агент может ставить пакеты, собирать проекты, читать логи — в рамках политики безопасности.\n• Script Runner / ремонт: только allowlisted-рецепты, не произвольный «злой» shell от модели.\n• Подробно: настройки Termux + раздел в справке.",
      en: "Termux is a separate app on the phone. AI Builder talks to it through the official bridge (it does not embed Termux’s core).\n\n• In Termux settings, turn the session on when you need shell commands.\n• The agent can install packages, build projects, read logs — within the safety policy.\n• Script Runner / repair uses allowlisted recipes only, not arbitrary shell from the model.\n• Details: Termux settings + the guide section.",
    },
  },
  {
    id: "runtime",
    title: {
      uk: "Екран «Середовище» (Runtime)",
      ru: "Экран «Среда» (Runtime)",
      en: "Runtime screen",
    },
    body: {
      uk: "Меню → Середовище. Тут зібрано інфраструктуру проєкту:\n\n• Health — перевірка Termux, Java/Gradle/Node, userspace; «Виправити все» лише за білим списком.\n• Supervisor / watchdog — стежить за довгими процесами.\n• Linux / Debian (proot) — контейнер, ланцюжок workspace → генерація → агент.\n• ADB — pair/connect, установка APK, logcat.\n• Проєкт — сесія, Ubuntu/Kali, термінал, агент, rootfs.\n• Відновлення, backup/profile, привілеї (Shizuku), native-accel (опційно).\n\nКожна кнопка має короткий підпис «навіщо вона».",
      ru: "Меню → Среда. Здесь собрана инфраструктура проекта:\n\n• Health — проверка Termux, Java/Gradle/Node, userspace; «Исправить всё» только по белому списку.\n• Supervisor / watchdog — следит за длинными процессами.\n• Linux / Debian (proot) — контейнер, цепочка workspace → генерация → агент.\n• ADB — pair/connect, установка APK, logcat.\n• Проект — сессия, Ubuntu/Kali, терминал, агент, rootfs.\n• Восстановление, backup/profile, привилегии (Shizuku), native-accel (опционально).\n\nУ каждой кнопки есть короткая подпись «зачем она».",
      en: "Menu → Runtime. Project infrastructure lives here:\n\n• Health — Termux, Java/Gradle/Node, userspace probes; “Repair all” is allowlisted only.\n• Supervisor / watchdog — watches long-running processes.\n• Linux / Debian (proot) — container and workspace → generate → agent pipeline.\n• ADB — pair/connect, APK install, logcat.\n• Project — session, Ubuntu/Kali, terminal, agent, rootfs.\n• Recovery, backup/profile, privileges (Shizuku), optional native accel.\n\nEvery button has a short “what it’s for” hint.",
    },
  },
  {
    id: "build",
    title: {
      uk: "Код і збірка APK",
      ru: "Код и сборка APK",
      en: "Code & APK builds",
    },
    body: {
      uk: "• Опишіть додаток у чаті або запустіть «Фабрику» на екрані Середовище.\n• Збірка йде через toolchain у Termux / userspace (Gradle тощо).\n• Довгі задачі показують progress і можуть тримати foreground-сповіщення.\n• Лог (меню → Лог) — головне місце, куди пишуться Build, Repair, Shizuku, Profile, Health.",
      ru: "• Опишите приложение в чате или запустите «Фабрику» на экране Среда.\n• Сборка идёт через toolchain в Termux / userspace (Gradle и т.д.).\n• Длинные задачи показывают progress и могут держать foreground-уведомление.\n• Лог (меню → Лог) — главное место, куда пишутся Build, Repair, Shizuku, Profile, Health.",
      en: "• Describe an app in chat or run the Factory on the Runtime screen.\n• Builds use the Termux / userspace toolchain (Gradle, etc.).\n• Long jobs show progress and may keep a foreground notification.\n• Log (menu → Log) is where Build, Repair, Shizuku, Profile, and Health lines go.",
    },
  },
  {
    id: "safety",
    title: {
      uk: "Безпека і обмеження",
      ru: "Безопасность и ограничения",
      en: "Safety & limits",
    },
    body: {
      uk: "• Немає прихованої зміни battery optimization — лише підказки, що зробити вручну.\n• Немає пропрієтарного proroot: userspace = termux-native + proot-distro (+ опційний open native-accel).\n• Ремонт Health — тільки відомі скрипти/рецепти.\n• API-ключі в захищеному сховищі; у лог секрети редагуються.\n• Shizuku — опційно, для піднятих прав shell, якщо ви самі встановили й запустили Shizuku.",
      ru: "• Нет скрытого изменения battery optimization — только подсказки, что сделать вручную.\n• Нет проприетарного proroot: userspace = termux-native + proot-distro (+ опциональный open native-accel).\n• Ремонт Health — только известные скрипты/рецепты.\n• API-ключи в защищённом хранилище; в логе секреты редактируются.\n• Shizuku — опционально, для повышенных прав shell, если вы сами установили и запустили Shizuku.",
      en: "• No silent battery-optimization changes — only guidance to do it yourself.\n• No proprietary proroot: userspace is termux-native + proot-distro (+ optional open native accel).\n• Health repair runs known scripts/recipes only.\n• API keys stay in secure storage; secrets are redacted in the log.\n• Shizuku is optional elevated shell if you install and start Shizuku yourself.",
    },
  },
  {
    id: "where",
    title: {
      uk: "Де що шукати в меню",
      ru: "Где что искать в меню",
      en: "Where to find things",
    },
    body: {
      uk: "• Чат — основна робота з моделлю.\n• Налаштування — моделі, ключі, параметри офлайн, агент, Termux.\n• Довідка по налаштуваннях — покрокові розділи з пошуком.\n• Середовище — Health, Debian, ADB, проєкт, backup.\n• Лог — єдина стрічка подій.\n• Пакети / проєкти — залежно від збірки UI.\n• Про додаток — цей текст.",
      ru: "• Чат — основная работа с моделью.\n• Настройки — модели, ключи, параметры офлайн, агент, Termux.\n• Справка по настройкам — пошаговые разделы с поиском.\n• Среда — Health, Debian, ADB, проект, backup.\n• Лог — единая лента событий.\n• Пакеты / проекты — в зависимости от сборки UI.\n• О приложении — этот текст.",
      en: "• Chat — main work with the model.\n• Settings — models, keys, offline params, agent, Termux.\n• Settings guide — step-by-step topics with search.\n• Runtime — Health, Debian, ADB, project, backup.\n• Log — single event stream.\n• Packages / projects — depending on the UI build.\n• About — this text.",
    },
  },
];

export function aboutLang(language: string): AboutLang {
  if (language === "uk" || language === "en") return language;
  return "ru";
}
