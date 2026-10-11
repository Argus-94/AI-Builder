/**
 * Экран «О приложении» — актуальные возможности AI Builder.
 */

export type AboutLang = "uk" | "ru" | "en";

export type AboutBlock = {
  id: string;
  title: Record<AboutLang, string>;
  body: Record<AboutLang, string>;
};

export const ABOUT_BLOCKS: AboutBlock[] = [
  {
    id: "what",
    title: {
      uk: "Що це",
      ru: "Что это",
      en: "What it is",
    },
    body: {
      uk: "AI Builder — мобільний помічник розробника на Android. У одному додатку: чат з ШІ (онлайн і офлайн), агент, що виконує команди в Termux, екран «Середовище виконання», менеджер пакетів, інтеграція з GitHub і журнал подій. Мета — збирати, перевіряти й правити проєкти прямо на телефоні.",
      ru: "AI Builder — мобильный помощник разработчика на Android. В одном приложении: чат с ИИ (онлайн и офлайн), агент, который выполняет команды в Termux, экран «Среда выполнения», менеджер пакетов, интеграция с GitHub и журнал событий. Цель — собирать, проверять и править проекты прямо на телефоне.",
      en: "AI Builder is a mobile developer assistant for Android. In one app: AI chat (online and offline), an agent that runs Termux commands, a Runtime environment screen, a package manager, GitHub integration, and an event log. The goal is to build, test, and fix projects on the phone itself.",
    },
  },
  {
    id: "agent-memory",
    title: {
      uk: "Пам’ять і траєкторії агента",
      ru: "Память и траектории агента",
      en: "Agent memory and trajectories",
    },
    body: {
      uk: "Для проєкту агент може зберігати короткі локальні нотатки та показувати кроки виконання в журналі сесій. Текст задачі, команди, вивід і шляхи в траєкторіях та regression fixtures замінюються приватними маркерами. Локальні skills і їхні pins зберігаються лише на пристрої; віддалений реєстр не завантажується.",
      ru: "Для проекта агент может хранить короткие локальные заметки и показывать шаги выполнения в журнале сессий. Текст задачи, команды, вывод и пути в trajectory и regression fixtures заменяются приватными маркерами. Локальные skills и их pins хранятся только на устройстве; удалённый реестр не загружается.",
      en: "For a project, the agent can retain short local notes and show execution steps in the session journal. Task text, commands, output, and paths in trajectories and regression fixtures are replaced with privacy markers. Local skills and their pins stay on-device; no remote registry is fetched.",
    },
  },
  {
    id: "chat",
    title: {
      uk: "Чат і сесія",
      ru: "Чат и сессия",
      en: "Chat and session",
    },
    body: {
      uk: "Головний екран — діалог з моделлю. У шапці: ☰, три значки середовища (Termux/Ubuntu), консоль, перехват, пакети. Агент працює у вибраному середовищі. Стоп — зупиняє задачу.",
      ru: "Главный экран — диалог с моделью. В шапке: ☰ меню, три значка среды (Termux / Ubuntu — активный подсвечен), консоль (глаз), перехват трафика, пакеты (куб). Termux ON/OFF, новые чаты, файлы и скриншоты. Агент выполняет команды в выбранной среде. Стоп — прерывает задачу во всех средах.",
      en: "Home chat screen. Header: ☰, three environment icons (Termux/Ubuntu — active highlighted), console, traffic interceptor, packages. Agent runs in the selected environment. Stop cancels the task in all backends.",
    },
  },
  {
    id: "models",
    title: {
      uk: "Моделі: онлайн і офлайн",
      ru: "Модели: онлайн и офлайн",
      en: "Models: online and offline",
    },
    body: {
      uk: "Онлайн: OpenRouter або власний API (Кастомний №1/№2) — потрібен інтернет і ключ.\nОфлайн: локальні GGUF (скачати або імпорт), робота без мережі після завантаження в пам’ять.\nПараметри n_ctx, threads, temperature тощо підбираються автоматично під пристрій або задаються вручну. Активну модель позначають галочкою в Налаштуваннях.",
      ru: "Онлайн: OpenRouter или свой API (Кастомный №1/№2) — нужны интернет и ключ.\nОфлайн: локальные GGUF (скачать или импорт), работа без сети после загрузки в память.\nПараметры n_ctx, threads, temperature и др. подбираются автоматически под устройство или задаются вручную. Активную модель отмечают галочкой в Настройках.",
      en: "Online: OpenRouter or a custom API (Custom #1/#2) — needs internet and a key.\nOffline: local GGUF models (download or import); works offline after loading into memory.\nn_ctx, threads, temperature, etc. are auto-tuned for the device or set manually. Mark the active model with a tick in Settings.",
    },
  },
  {
    id: "termux-packages",
    title: {
      uk: "Termux і пакети інструментів",
      ru: "Termux и пакеты инструментов",
      en: "Termux and tool packages",
    },
    body: {
      uk: "Termux встановлюється окремо (F-Droid/GitHub). У додатку: сесія, консоль, пріоритет ваших команд над чергою агента.\nПраве меню (куб) — каталог інструментів (git, python, node, JDK…). Встановлення використовує налаштоване вами дзеркало й джерела apt та не переписує їх; перед встановленням успішно оновлюються списки пакетів. Потрібні дозвіл RUN_COMMAND і allow-external-apps=true у Termux.",
      ru: "Termux ставится отдельно (F-Droid/GitHub). В приложении: сессия, консоль, приоритет ваших команд над очередью агента.\nПравое меню (куб) — каталог инструментов (git, python, node, JDK…). Установка использует настроенные вами зеркало и источники apt, не переписывая их; перед установкой списки пакетов должны успешно обновиться. Нужны разрешение RUN_COMMAND и allow-external-apps=true в Termux.",
      en: "Install Termux separately (F-Droid/GitHub). In the app: session, console, and your typed commands jump the agent queue.\nThe tools drawer (cube) lists packages (git, python, node, JDK…). Install uses your configured apt mirror and sources without rewriting them; package indexes must update successfully before installation. You need the RUN_COMMAND permission and allow-external-apps=true in Termux.",
    },
  },
  {
    id: "runtime",
    title: {
      uk: "Середовище виконання",
      ru: "Среда выполнения",
      en: "Runtime environment",
    },
    body: {
      uk: "Пункт меню «Середовище виконання»: статус runtime, проєкти, контейнери (Ubuntu через proot-distro), діагностика Health, відновлення. Тут же прив’язка активного проєкту й запуск середовищ для збірки.",
      ru: "Пункт меню «Среда выполнения»: статус runtime, проекты, контейнеры (Ubuntu через proot-distro), диагностика Health, восстановление. Здесь же привязка активного проекта и запуск сред для сборки.",
      en: "The “Runtime environment” menu: runtime status, projects, containers (Ubuntu via proot-distro), Health diagnostics, and recovery. Bind the active project and launch build environments from here.",
    },
  },
  {
    id: "github",
    title: {
      uk: "GitHub",
      ru: "GitHub",
      en: "GitHub",
    },
    body: {
      uk: "Два рівні роботи з GitHub.\n\n1) Екран ☰ → GitHub — файловий менеджер.\n2) Агент ІІ в чаті (тумблер GitHub) може: repo/list/tree/read/write, commit/branch, PR, issues, releases, search/diff.\nТокен (scope repo) один раз на пристрої. Для APK GitHub не обов'язковий.",
      ru: "Два уровня работы с GitHub.\n\n1) Экран ☰ → GitHub — файловый менеджер репозиториев: список репо, две панели, редактор, коммиты, ZIP, загрузка/скачивание. Токен (scope repo) вводится один раз.\n\n2) Агент ИИ в чате (когда включён интеллект GitHub) может через инструменты:\n• github.repo / list / tree / read / write — обзор и правка файлов;\n• github.commit / commits / branch / branches / tags — история и ветки;\n• github.pr-list / pr-create / pr-files / pr-merge — pull request;\n• github.issue / issue-create / issue-comment / search-issues — задачи;\n• github.releases / release / download-asset — релизы;\n• github.search / diff / materialize / pack — поиск, diff, выгрузка.\n\nАгент не обходит политику безопасности и не подставляет чужой токен. Для сборок APK GitHub обычно не обязателен — только если задача про репозиторий.",
      en: "Two layers:\n1) ☰ → GitHub file manager (repos, dual panes, editor, commits, ZIP).\n2) Chat agent tools when GitHub intelligence is on: repo/list/tree/read/write, commit/branch, PRs, issues, releases, search/diff.\nToken (repo scope) stored on device once. Not required for plain APK builds.",
    },
  },
  {
    id: "ui",
    title: {
      uk: "Інтерфейс",
      ru: "Интерфейс",
      en: "Interface",
    },
    body: {
      uk: "Одна спільна шапка на всіх екранах: ☰ — бічне меню, заголовок, око — консоль, куб — пакети. Темна тема, мови uk/ru/en. Кнопки дій — DarkSlateGray (#2F4F4F).",
      ru: "Одна общая шапка на всех экранах: ☰ — боковое меню, заголовок, глаз — консоль, куб — пакеты. Тёмная тема, языки uk/ru/en. Кнопки действий — DarkSlateGray (#2F4F4F).",
      en: "One shared header on every screen: ☰ drawer, title, eye for console, cube for packages. Dark theme, uk/ru/en. Action buttons use DarkSlateGray (#2F4F4F).",
    },
  },
  {
    id: "environments",
    title: {
      uk: "Середовища: Termux / Ubuntu",
      ru: "Среды: Termux / Ubuntu",
      en: "Environments: Termux / Ubuntu",
    },
    body: {
      uk: "Три значки в шапці (без підписів): термінал = Termux, планета = Ubuntu, сервер = Debian. Активний підсвічений. Значки лише показують середовище; перемикається воно на екрані «Середовище виконання».\n• Termux — pkg, $PREFIX, швидкі збірки tool-pack.\n• Ubuntu/Debian — apt у proot, повний userspace.\nСтоп скасовує команду в будь-якому режимі.",
      ru: "Три значка в шапке (без подписей): терминал = Termux, планета = Ubuntu, сервер = Debian. Активный подсвечен. Значки только показывают среду; переключается она на экране «Среда выполнения».\n• Termux — pkg, $PREFIX, tool-pack.\n• Ubuntu/Debian — apt в proot, полный userspace.\nСтоп отменяет команду в любом режиме.",
      en: "Three header icons (no labels): terminal = Termux, planet = Ubuntu, server = Debian. Active is highlighted. The icons only display the environment; switch it on the Runtime screen.\n• Termux — pkg, $PREFIX.\n• Ubuntu/Debian — apt in proot.\nStop cancels work in every mode.",
    },
  },
  {
    id: "interceptor",
    title: {
      uk: "Перехоплення трафіку (тести)",
      ru: "Перехват трафика (тесты)",
      en: "Traffic interceptor (testing)",
    },
    body: {
      uk: "Локальний proxy для відлагодження ВАШИХ додатків: mock відповіді, правка JSON, затримки, блок аналітики. Не для обходу чужих платежів — лише тести на своєму пристрої. Повний приклад — у «Довідка по налаштуваннях» → Перехват.",
      ru: "Локальный proxy для отладки ВАШИХ приложений: mock ответов, правка JSON, задержки, блок аналитики. Не для обхода чужих платежей — только тесты на своём устройстве. Полный пример — в «Справка по настройкам» → Перехват.",
      en: "Local proxy to debug YOUR apps: mock responses, JSON edits, delays, block analytics. Not for bypassing third-party payments — device tests only. Full walkthrough in Settings guide → Interceptor.",
    },
  },
  {
    id: "privacy",
    title: {
      uk: "Дані та безпека",
      ru: "Данные и безопасность",
      en: "Data and safety",
    },
    body: {
      uk: "Ключі й токени зберігаються на пристрої. Команди Termux проходять перевірку політики безпеки (allowlist). Офлайн-модель не надсилає діалог у хмару. Онлайн-режим надсилає повідомлення обраному API-провайдеру.",
      ru: "Ключи и токены хранятся на устройстве. Команды Termux проходят проверку политики безопасности (allowlist). Офлайн-модель не отправляет диалог в облако. Онлайн-режим отправляет сообщения выбранному API-провайдеру.",
      en: "Keys and tokens stay on the device. Termux commands go through a safety allowlist. Offline models do not send chat to the cloud. Online mode sends messages to your chosen API provider.",
    },
  },
];
