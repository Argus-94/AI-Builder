/**
 * Справка по настройкам — пошагово, простым языком (v1.6.29+).
 */

export type GuideLang = "uk" | "ru" | "en";

export type GuideDownload = {
  label: Record<GuideLang, string>;
  url: string;
};

export type GuideSection = {
  id: string;
  title: Record<GuideLang, string>;
  body: Record<GuideLang, string>;
  tags: string[];
  downloads?: GuideDownload[];
};

export const SETTINGS_GUIDE: GuideSection[] = [
  {
    id: "start",
    title: {
      uk: "З чого почати",
      ru: "С чего начать",
      en: "Getting started",
    },
    body: {
      uk: "1. Меню (☰) → Налаштування.\n2. Оберіть мову інтерфейсу.\n3. Вирішіть: онлайн-модель чи офлайн GGUF (або обидві по черзі).\n4. Для онлайн: перевірте ключ OpenRouter або заповніть Кастомний №1/№2.\n5. Для офлайн: «Скачати» або «Імпорт LLM», дочекайтесь файлу, «Завантажити в пам’ять».\n6. Поставте галочку «Використовувати як активну» біля потрібного режиму.\n7. Відкрийте Чат і надішліть повідомлення.\n\nЯкщо щось не відповідає — Меню → Лог: там видно помилки мережі, моделі, Termux.",
      ru: "1. Меню (☰) → Настройки.\n2. Выберите язык интерфейса.\n3. Решите: онлайн-модель или офлайн GGUF (можно переключать).\n4. Для онлайн: проверьте ключ OpenRouter или заполните Кастомный №1/№2.\n5. Для офлайн: «Скачать» или «Импорт LLM», дождитесь файла, «Загрузить в память».\n6. Галочка «Использовать как активную» у нужного режима.\n7. Откройте Чат и отправьте сообщение.\n\nЕсли нет ответа — Меню → Лог: там ошибки сети, модели, Termux.",
      en: "1. Menu (☰) → Settings.\n2. Set the UI language.\n3. Choose online model or offline GGUF (you can switch later).\n4. Online: check the OpenRouter key or fill Custom #1/#2.\n5. Offline: Download or Import LLM, wait for the file, then Load into memory.\n6. Tick “Use as active” on the mode you want.\n7. Open Chat and send a message.\n\nNo reply? Menu → Log shows network, model, and Termux errors.",
    },
    tags: ["start", "начало", "перший", "first", "старт"],
  },
  {
    id: "api-key",
    title: {
      uk: "OpenRouter (онлайн)",
      ru: "OpenRouter (онлайн)",
      en: "OpenRouter (online)",
    },
    body: {
      uk: "Налаштування → блок онлайн-моделі / OpenRouter.\n\n• Вставте API-ключ (або залиште ключ «з коробки», якщо він уже підставлений).\n• Оберіть модель зі списку або вкажіть ID.\n• Увімкніть «Використовувати як активну», якщо чат має йти через OpenRouter.\n• Ключ зберігається в захищеному сховищі пристрою, у Лог повністю не пишеться.",
      ru: "Настройки → блок онлайн-модели / OpenRouter.\n\n• Вставьте API-ключ (или оставьте ключ «из коробки», если он уже подставлен).\n• Выберите модель из списка или укажите ID.\n• Включите «Использовать как активную», если чат должен идти через OpenRouter.\n• Ключ хранится в защищённом хранилище устройства, в Лог целиком не попадает.",
      en: "Settings → online model / OpenRouter block.\n\n• Paste an API key (or keep the pre-filled one if present).\n• Pick a model from the list or enter an ID.\n• Enable “Use as active” so chat goes through OpenRouter.\n• The key is stored in the device secure store and is redacted in the Log.",
    },
    tags: ["openrouter", "api", "ключ", "key", "online", "онлайн"],
  },
  {
    id: "custom-1",
    title: {
      uk: "Кастомний №1",
      ru: "Кастомный №1",
      en: "Custom #1",
    },
    body: {
      uk: "Налаштування → Кастомний №1 → «Налаштувати».\n\nЗаповніть:\n• назву (необов’язково);\n• Base URL (наприклад https://api.example.com/v1);\n• Model ID;\n• API-ключ;\n• за потреби шлях chat (зазвичай /chat/completions) і JSON-заголовки.\n\nЗбережіть і увімкніть «Використовувати для чату й агента». Підходить будь-який OpenAI-сумісний шлюз.",
      ru: "Настройки → Кастомный №1 → «Настроить».\n\nЗаполните:\n• название (необязательно);\n• Base URL (например https://api.example.com/v1);\n• Model ID;\n• API-ключ;\n• при необходимости путь chat (обычно /chat/completions) и JSON-заголовки.\n\nСохраните и включите «Использовать для чата и агента». Подойдёт любой OpenAI-совместимый шлюз.",
      en: "Settings → Custom #1 → Configure.\n\nFill in:\n• optional name;\n• Base URL (e.g. https://api.example.com/v1);\n• Model ID;\n• API key;\n• optional chat path (usually /chat/completions) and JSON headers.\n\nSave and enable “Use for chat and agent”. Any OpenAI-compatible gateway works.",
    },
    tags: ["custom", "кастом", "provider", "api", "openai"],
  },
  {
    id: "custom-2",
    title: {
      uk: "Кастомний №2",
      ru: "Кастомный №2",
      en: "Custom #2",
    },
    body: {
      uk: "Другий незалежний слот — такі самі поля, як у №1 (порожні за замовчуванням, без пресета DeepSeek).\n\nЗручно тримати, наприклад, робочий і «запасний» API або різні моделі на різних хостах. Активним може бути лише один кастомний слот (перемикач «Використовувати…»).",
      ru: "Второй независимый слот — те же поля, что у №1 (по умолчанию пустые, без пресета DeepSeek).\n\nУдобно держать, например, рабочий и «запасной» API или разные модели на разных хостах. Активен только один кастомный слот (переключатель «Использовать…»).",
      en: "A second independent slot with the same fields as #1 (empty by default, no DeepSeek preset).\n\nHandy for a primary and backup API, or different models on different hosts. Only one custom slot is active at a time (“Use…” toggle).",
    },
    tags: ["custom", "кастомный", "слот", "deepseek", "api"],
  },
  {
    id: "opencode",
    title: {
      uk: "OpenCode",
      ru: "OpenCode",
      en: "OpenCode",
    },
    body: {
      uk: "Окремий пресет шлюзу OpenCode Zen. Перевірте Base URL, модель і ключ, збережіть і за потреби зробіть режим активним. Якщо відповідь порожня — дивіться Лог і правильність URL.",
      ru: "Отдельный пресет шлюза OpenCode Zen. Проверьте Base URL, модель и ключ, сохраните и при необходимости сделайте режим активным. Если ответ пустой — смотрите Лог и правильность URL.",
      en: "A dedicated OpenCode Zen gateway preset. Check Base URL, model and key, save, and activate the mode if needed. Empty replies → check the Log and URL.",
    },
    tags: ["opencode", "zen", "api"],
  },
  {
    id: "offline-model",
    title: {
      uk: "Офлайн-модель (GGUF)",
      ru: "Офлайн-модель (GGUF)",
      en: "Offline model (GGUF)",
    },
    body: {
      uk: "1. Скачайте модель кнопкою в Налаштуваннях або імпортуйте .gguf з телефону.\n2. За потреби імпортуйте mmproj (vision) — другий файл.\n3. Режим «Авто (телефон + модель)» сам підставить n_ctx, n_threads, temperature, max tokens, Top-P з урахуванням ОЗП і розміру/кванту файлу. «Скинути на авто» — перерахувати.\n4. «Завантажити в пам’ять» — модель готова відповідати офлайн.\n5. У шторці з’явиться сповіщення «модель у пам’яті»; «Вивантажити з пам’яті» звільняє RAM.\n6. Після ручної зміни n_ctx / потоків знову вивантажте й завантажте модель.\n\nПотрібен arm64 і кілька ГБ вільного місця.",
      ru: "1. Скачайте модель кнопкой в Настройках или импортируйте .gguf с телефона.\n2. При необходимости импортируйте mmproj (vision) — второй файл.\n3. Режим «Авто (телефон + модель)» сам подставит n_ctx, n_threads, temperature, max tokens, Top-P с учётом ОЗУ и размера/кванта файла. «Сбросить на авто» — пересчитать.\n4. «Загрузить в память» — модель готова отвечать офлайн.\n5. В шторке появится уведомление «модель в памяти»; «Выгрузить из памяти» освобождает RAM.\n6. После ручного изменения n_ctx / потоков снова выгрузите и загрузите модель.\n\nНужны arm64 и несколько ГБ свободного места.",
      en: "1. Download via Settings or import a .gguf from the phone.\n2. Optionally import mmproj (vision) as the second file.\n3. “Auto (device + model)” fills n_ctx, n_threads, temperature, max tokens, Top-P from RAM and file size/quant. “Reset to auto” recomputes.\n4. “Load into memory” makes the model answer offline.\n5. A “model in memory” notification appears; “Unload from memory” frees RAM.\n6. After manual n_ctx/thread changes, unload and load again.\n\nRequires arm64 and several GB free.",
    },
    tags: ["offline", "офлайн", "gguf", "n_ctx", "память", "memory", "авто"],
    downloads: [
      {
        label: {
          uk: "Каталог GGUF на Hugging Face (приклад)",
          ru: "Каталог GGUF на Hugging Face (пример)",
          en: "GGUF catalog on Hugging Face (example)",
        },
        url: "https://huggingface.co/models?library=gguf",
      },
    ],
  },
  {
    id: "offline-params",
    title: {
      uk: "Параметри офлайн (n_ctx, потоки…)",
      ru: "Параметры офлайн (n_ctx, потоки…)",
      en: "Offline parameters (n_ctx, threads…)",
    },
    body: {
      uk: "• n_ctx — довжина контексту (історія + відповідь). Більше = розумніше на довгих діалогах, але їсть RAM.\n• n_threads — скільки ядер CPU. Занадто багато може сповільнити UI.\n• n_gpu_layers — за замовчуванням 0 (стабільніше на різних GPU).\n• temperature / Top-P / max tokens — стиль і довжина відповіді.\n\nВ «Авто» значення підбираються під телефон і файл моделі. У «Ручний» — ви самі; не забудьте перезавантажити модель у пам’ять.",
      ru: "• n_ctx — длина контекста (история + ответ). Больше = лучше на длинных диалогах, но ест RAM.\n• n_threads — сколько ядер CPU. Слишком много может тормозить UI.\n• n_gpu_layers — по умолчанию 0 (стабильнее на разных GPU).\n• temperature / Top-P / max tokens — стиль и длина ответа.\n\nВ «Авто» значения подбираются под телефон и файл модели. В «Ручной» — вы сами; не забудьте перезагрузить модель в память.",
      en: "• n_ctx — context length (history + answer). Higher helps long chats but uses more RAM.\n• n_threads — CPU cores. Too many can slow the UI.\n• n_gpu_layers — default 0 (more stable across GPUs).\n• temperature / Top-P / max tokens — style and answer length.\n\nAuto tunes for the phone and model file. Manual is yours — reload the model after changes.",
    },
    tags: ["n_ctx", "threads", "gpu", "temperature", "параметры", "params"],
  },
  {
    id: "system-prompt",
    title: {
      uk: "Системний промпт",
      ru: "Системный промпт",
      en: "System prompt",
    },
    body: {
      uk: "Глобальні інструкції для моделі (онлайн і офлайн). Дописуються до вбудованого промпта. Тримайте коротко: довгий промпт з’їдає n_ctx.",
      ru: "Глобальные инструкции для модели (онлайн и офлайн). Дописываются к встроенному промпту. Держите коротко: длинный промпт съедает n_ctx.",
      en: "Global instructions for online and offline models, appended to the built-in prompt. Keep it short — a long prompt burns n_ctx.",
    },
    tags: ["prompt", "промпт", "system"],
  },
  {
    id: "agent-intelligence",
    title: {
      uk: "Інтелект агента",
      ru: "Интеллект агента",
      en: "Agent intelligence",
    },
    body: {
      uk: "Тонкі налаштування поведінки агента (глибина планування, обережність команд тощо). Кожен пункт у UI має підказку «навіщо». Не вмикайте все підряд на слабкому телефоні з офлайн-моделлю.",
      ru: "Тонкие настройки поведения агента (глубина планирования, осторожность команд и т.д.). У каждого пункта в UI есть подсказка «зачем». Не включайте всё подряд на слабом телефоне с офлайн-моделью.",
      en: "Fine-tunes agent behaviour (planning depth, command caution, etc.). Each UI row has a “why” hint. Don’t enable everything on a weak phone with an offline model.",
    },
    tags: ["agent", "агент", "intelligence"],
  },
  {
    id: "termux-install",
    title: {
      uk: "Встановлення Termux",
      ru: "Установка Termux",
      en: "Install Termux",
    },
    body: {
      uk: "Termux і Termux:API ставляться окремо (F-Droid / GitHub). AI Builder їх не містить усередині APK.\n\nПісля встановлення в Termux один раз дозвольте зовнішні додатки (allow-external-apps), якщо користуєтесь мостом RUN_COMMAND — див. підказки в Налаштуваннях Termux.",
      ru: "Termux и Termux:API ставятся отдельно (F-Droid / GitHub). AI Builder не содержит их внутри APK.\n\nПосле установки в Termux один раз разрешите внешние приложения (allow-external-apps), если пользуетесь мостом RUN_COMMAND — см. подсказки в настройках Termux.",
      en: "Install Termux and Termux:API separately (F-Droid / GitHub). AI Builder does not ship them inside its APK.\n\nOnce installed, allow external apps in Termux if you use the RUN_COMMAND bridge — see Termux settings hints.",
    },
    tags: ["termux", "install", "установка"],
  },
  {
    id: "termux-session",
    title: {
      uk: "Termux-сесія в додатку",
      ru: "Termux-сессия в приложении",
      en: "In-app Termux session",
    },
    body: {
      uk: "Налаштування Termux → увімкнути сесію. Тоді агент і чат можуть слати команди в Termux. Консоль показує «живий» вивід. Ваші команди з поля вводу мають пріоритет над чергою агента.",
      ru: "Настройки Termux → включить сессию. Тогда агент и чат могут слать команды в Termux. Консоль показывает «живой» вывод. Ваши команды из поля ввода имеют приоритет над очередью агента.",
      en: "Termux settings → enable the session so the agent and chat can send commands. The console shows live output. Commands you type jump the agent queue.",
    },
    tags: ["termux", "session", "сессия", "консоль"],
  },
  {
    id: "shizuku",
    title: {
      uk: "Shizuku (опційно)",
      ru: "Shizuku (опционально)",
      en: "Shizuku (optional)",
    },
    body: {
      uk: "Не обов’язково. Якщо встановлено Shizuku і є rish у PATH, Runtime може виконувати окремі команди з підвищеними правами. На екрані Середовище є тест Shizuku. Без Shizuku додаток працює в звичайному режимі.",
      ru: "Не обязательно. Если установлен Shizuku и есть rish в PATH, Runtime может выполнять отдельные команды с повышенными правами. На экране Среда есть тест Shizuku. Без Shizuku приложение работает в обычном режиме.",
      en: "Optional. With Shizuku installed and rish on PATH, Runtime can run some elevated commands. The Runtime screen has a Shizuku test. Without it, the app works normally.",
    },
    tags: ["shizuku", "rish", "права", "root"],
  },
  {
    id: "runtime-screen",
    title: {
      uk: "Екран «Середовище»",
      ru: "Экран «Среда»",
      en: "Runtime screen",
    },
    body: {
      uk: "Меню → Середовище.\n\n• Health — діагностика; «Виправити» лише allowlisted-рецепти.\n• Supervisor — watchdog довгих процесів.\n• Debian / контейнер — створити, workspace, генерація, coding-агент, стоп/видалити.\n• ADB — pair, connect, APK, logcat.\n• Проєкт — сесія, Ubuntu, термінал, агент, Kali, proot, rootfs.\n• Відновлення — скинути «залиплі» сесії/процеси без видалення проєктів.\n• Копія / профіль — backup даних; export профілю може йти в Download/.\n\nУ Лог пишуться дії Health, Repair, Shizuku, Profile, Foreground.",
      ru: "Меню → Среда.\n\n• Health — диагностика; «Исправить» только allowlisted-рецепты.\n• Supervisor — watchdog длинных процессов.\n• Debian / контейнер — создать, workspace, генерация, coding-агент, стоп/удалить.\n• ADB — pair, connect, APK, logcat.\n• Проект — сессия, Ubuntu, терминал, агент, Kali, proot, rootfs.\n• Восстановление — сбросить «залипшие» сессии/процессы без удаления проектов.\n• Копия / профиль — backup данных; export профиля может идти в Download/.\n\nВ Лог пишутся действия Health, Repair, Shizuku, Profile, Foreground.",
      en: "Menu → Runtime.\n\n• Health — diagnostics; repair is allowlisted only.\n• Supervisor — watchdog for long jobs.\n• Debian / container — create, workspace, generate, coding agent, stop/remove.\n• ADB — pair, connect, APK, logcat.\n• Project — session, Ubuntu, terminal, agent, Kali, proot, rootfs.\n• Recovery — clear stuck sessions/processes without deleting projects.\n• Backup / profile — data snapshot; profile export may use Download/.\n\nHealth, Repair, Shizuku, Profile, Foreground lines go to the Log.",
    },
    tags: ["runtime", "среда", "health", "debian", "adb", "backup"],
  },
  {
    id: "background",
    title: {
      uk: "Фон і батарея",
      ru: "Фон и батарея",
      en: "Background & battery",
    },
    body: {
      uk: "Android може вбивати довгі збірки. Додаток не змінює battery optimization сам — показує нагадування, якщо збірка/агент гинули ≥2 рази. Відкрийте системні налаштування й дозвольте роботу у фоні вручну. Sticky-сповіщення моделі й задач допомагають тримати процес живим.",
      ru: "Android может убивать длинные сборки. Приложение само не меняет battery optimization — показывает напоминание, если сборка/агент гибли ≥2 раза. Откройте системные настройки и разрешите работу в фоне вручную. Sticky-уведомления модели и задач помогают держать процесс живым.",
      en: "Android may kill long builds. The app never changes battery optimization itself — it only reminds you if build/agent died ≥2 times. Open system settings and allow background work manually. Sticky model/task notifications help keep the process alive.",
    },
    tags: ["battery", "фон", "background", "уведомления", "notification"],
  },
  {
    id: "logs",
    title: {
      uk: "Лог",
      ru: "Лог",
      en: "Log",
    },
    body: {
      uk: "Меню → Лог — єдина стрічка: чат, мережа, Build, Termux, Repair, Shizuku, Profile, KeepAlive, Settings (авто-параметри моделі).\n\nСекрети (ключі) маскуються. Лог переживає перезапуск у розумних межах об’єму.",
      ru: "Меню → Лог — единая лента: чат, сеть, Build, Termux, Repair, Shizuku, Profile, KeepAlive, Settings (авто-параметры модели).\n\nСекреты (ключи) маскируются. Лог переживает перезапуск в разумных пределах объёма.",
      en: "Menu → Log — one stream: chat, network, Build, Termux, Repair, Shizuku, Profile, KeepAlive, Settings (auto model params).\n\nSecrets are redacted. The log survives restarts within size limits.",
    },
    tags: ["log", "лог", "debug", "ошибки"],
  },
  {
    id: "permissions",
    title: {
      uk: "Дозволи Android",
      ru: "Разрешения Android",
      en: "Android permissions",
    },
    body: {
      uk: "За потреби: сповіщення, установка APK, доступ до файлів для імпорту моделі, мікрофон для голосу. Давайте лише те, чим користуєтесь. Без root додаток працює.",
      ru: "По необходимости: уведомления, установка APK, доступ к файлам для импорта модели, микрофон для голоса. Давайте только то, чем пользуетесь. Без root приложение работает.",
      en: "As needed: notifications, install APKs, files for model import, mic for voice. Grant only what you use. Root is not required.",
    },
    tags: ["permissions", "разрешения", "apk"],
  },
  {
    id: "theme-ui",
    title: {
      uk: "Тема і мова",
      ru: "Тема и язык",
      en: "Theme & language",
    },
    body: {
      uk: "У Налаштуваннях оберіть мову (uk / ru / en) і світлу/темну тему. Довідка й «Про додаток» одразу перемикаються мовою інтерфейсу.",
      ru: "В Настройках выберите язык (uk / ru / en) и светлую/тёмную тему. Справка и «О приложении» сразу переключаются на язык интерфейса.",
      en: "In Settings pick language (uk / ru / en) and light/dark theme. The guide and About screens follow the UI language.",
    },
    tags: ["theme", "язык", "language", "ui"],
  },
  {
    id: "quick-checklist",
    title: {
      uk: "Швидкий чеклист «нічого не працює»",
      ru: "Быстрый чеклист «ничего не работает»",
      en: "Quick “nothing works” checklist",
    },
    body: {
      uk: "1. Активна потрібна модель? (галочка в Налаштуваннях)\n2. Офлайн: модель «У пам’яті»? Інакше «Завантажити в пам’ять».\n3. Онлайн: ключ і мережа; див. Лог.\n4. Termux-команди: Termux встановлено, сесія увімкнена, allow-external-apps.\n5. Збірка вбивається системою: фон/батарея вручну + sticky-сповіщення.\n6. Середовище → Health → дивіться червоні пункти.",
      ru: "1. Активна нужная модель? (галочка в Настройках)\n2. Офлайн: модель «В памяти»? Иначе «Загрузить в память».\n3. Онлайн: ключ и сеть; смотрите Лог.\n4. Termux-команды: Termux установлен, сессия включена, allow-external-apps.\n5. Сборка убивается системой: фон/батарея вручную + sticky-уведомление.\n6. Среда → Health → смотрите красные пункты.",
      en: "1. Is the right model active? (tick in Settings)\n2. Offline: is it “In memory”? If not, Load into memory.\n3. Online: key and network; check the Log.\n4. Termux commands: Termux installed, session on, allow-external-apps.\n5. Build killed by the OS: set background/battery manually + sticky notification.\n6. Runtime → Health → inspect red items.",
    },
    tags: ["troubleshoot", "ошибка", "checklist", "help"],
  },,
  {
    id: "security-policy",
    title: {
      uk: "Політика безпеки команд",
      ru: "Политика безопасности команд",
      en: "Command security policy",
    },
    body: {
      uk: "Команди на пристрої перевіряються allowlist (Shizuku/ADB/plugin). Небезпечні шаблони блокуються. Документ: docs/SECURITY_POLICY.md у репозиторії.",
      ru: "Команды на устройстве проверяются allowlist (Shizuku/ADB/plugin). Опасные шаблоны блокируются. Документ: docs/SECURITY_POLICY.md в репозитории.",
      en: "Device commands go through an allowlist (Shizuku/ADB/plugin). Dangerous patterns are blocked. See docs/SECURITY_POLICY.md.",
    },
    tags: ["security", "policy", "allowlist", "безпека"],
  },
  {
    id: "agent-presets",
    title: {
      uk: "Пресети агента",
      ru: "Пресеты агента",
      en: "Agent presets",
    },
    body: {
      uk: "Налаштування → Пресеты: balanced / coder / careful / apk_build / readonly. Застосовує набір тумблерів інтелекту агента одним натиском.",
      ru: "Настройки → Пресеты: balanced / coder / careful / apk_build / readonly. Применяет набор тумблеров интеллекта агента одним нажатием.",
      en: "Settings → Presets: balanced / coder / careful / apk_build / readonly. Applies an agent-intelligence profile in one tap.",
    },
    tags: ["agent", "preset", "пресет"],
  },

];

export function filterSettingsGuide(query: string, lang: GuideLang): GuideSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return SETTINGS_GUIDE;
  return SETTINGS_GUIDE.filter((s) => {
    const title = s.title[lang].toLowerCase();
    const body = s.body[lang].toLowerCase();
    const tags = s.tags.join(" ").toLowerCase();
    return title.includes(q) || body.includes(q) || tags.includes(q);
  });
}
