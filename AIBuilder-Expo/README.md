# AI Builder v399

AI-IDE для разработки Android-приложений с ИИ. Текущая версия приложения: **1.6.7**.

## Изменения v399

- DevicePrivilegeDetection (Shizuku/Root/adb via device APIs)
- RootfsImageManifest + isRootfsReady
- TerminalOutputBus → TermuxConsoleContext
- Agent tools: runtime.status/session/terminal/proot
- TerminalOutputBus → Termux console stream
- RootfsEnsure + ensureRootfs + E2E contract selftest
- RuntimeStatus.sessionList + close_all_terminals recovery
- Runtime UI: Final validation
- RuntimeStatus.toolchainList + refreshToolchains recovery
- RuntimeStatus.agentList + recovery refresh_privileges
- Recovery: stop/destroy all containers + UI Recovery panel
- Runtime UI: Stop/Destroy container (project не удаляется)
- RuntimeStatus.containerList + Proot привязан к instance
- RootfsDiscovery + runProotAuto + UI Proot (auto)
- runProotPlanForInstance (exec via Termux env)
- ProotCommandBuilder + buildProotPlanForInstance
- Unified ContainerShell API (ubuntu|kali)
- KaliShell + RuntimeFacade.launchKali + UI Launch Kali
- test:core-agent-security + process list в Runtime UI
- UbuntuShell spec + Runtime Create agent UI
- Agent: shell.exec + terminal.open (host hooks)
- RuntimeFacade.createAgentForProject + setHostHooks
- TermuxTerminalBackend + openTerminalForProject (HOME/PWD/PROJECT_ROOT)
- Runtime UI: кнопка Open terminal
- Runtime ↔ ProjectContext: активный проект, Bind to Runtime
- Экран Runtime (app/runtime.tsx) + пункт в drawer
- i18n uk/ru/en для Runtime
- hooks/useRuntime — UI status/diagnostics/session/Ubuntu
- core/project-runtime — bind project ↔ session/container
- scripts/aib-runtime-facade-selftest.mjs + test:runtime-facade
- UbuntuLifecycle / KaliLifecycle (project mount, destroy без удаления project)
- RuntimeStatus snapshot для UI
- lib/runtime-facade.ts singleton для app-слоя
- RuntimeFacade.launchUbuntu / registerDefaultToolchainSources
- RuntimeFacade:
 единая связка HOME→Env→Session→Containers→Agent→Bridge→Privilege→Native
- DeviceManager, BackupMigration (project survival invariants)
- Agent: fs.exists/mkdir/read с HOME isolation
- core/index.ts публичный runtime surface
- Этапы 6–12: каркас + интеграция

## Изменения v376

- Этапы 6–12 реализованы (runtime-only):
  - ProcessRegistry, LockManager, SessionManager, DiagnosticReport, RecoveryManager
  - ContainerManager / UserspaceContainerBackend, MountSpec, ContainerPolicy
  - Ubuntu + Kali profiles, project → /workspace mount
  - AgentManager + AgentPolicy (capability gating) via ExecutionEnvironment
  - AndroidBridge (auth, device info, notify skeleton)
  - PrivilegeProvider: None / Shizuku / Root + capability detection
  - NativeContainerRuntime (optional), FinalValidation harness
- Инварианты A–L сохранены: compilation settings не менялись, containers не владеют projects, Shizuku/Root optional.
- Версия 1.3.375 → 1.3.399; обновлён hash package.json в CompilationSettingsGuard.

## Изменения v375

- Операция 4.6: terminal regression + ProcessHandle + stop/interrupt/kill.
- Этап 5 Toolchains: ToolchainManager, Manifest, SDK/Java/Node/Python/Git discovery, diagnostics.

## Изменения v374

- В Script Runner отключение LLM больше не означает отключение восстановления: детерминированный recovery продолжает работать.
- Добавлен отдельный no-LLM recovery для отсутствующего `gradle-wrapper.jar`; при наличии уже установленного Gradle он может восстановить только JAR, сохраняя существующий `gradle-wrapper.properties` побайтно.
- Сетевые сбои получают отдельный безопасный retry с backoff без изменения версий зависимостей и Gradle-настроек проекта.
- Сообщение Script Runner теперь явно разделяет «LLM выключен» и «авто-восстановление включено».
- Исправлен критический ReferenceError в общем обработчике ошибок `useLLM`: использовался несуществующий идентификатор `errorTag`; теперь для общего LLM-обработчика используется стабильный тег `LLM`.
- Версия архива повышена с 1.3.373 до 1.3.374.
- Recovery теперь принципиально не переписывает `gradle.properties`, `gradle-wrapper.properties`, `local.properties` или `gradle-daemon-jvm.properties` проекта; временные параметры памяти/Java/NDK передаются только через окружение и CLI.
- Убран hard-code версий NDK/Gradle из Script Runner recovery.
- Добавлен self-test `test:project-settings-readonly` для контроля этого инварианта.

## Актуальная справка и изменения

В актуальной сборке основные рабочие разделы бокового меню: **Чат, Настройки, Лог, Точки сохранения, Настройки Termux, Справочник по командам и Справка по настройкам**. Справка внутри приложения обновлена под текущие провайдеры, локальную модель, интеллект агента, диагностику и новый экран Termux.

### Провайдеры и модели
- **OpenRouter** — API-ключ сохраняется локально; кнопки в основном окне настроек: «Сохранить ключ» и «Проверить ключ». В «Моделях OpenRouter» можно выбрать модель, проверить её доступность и изменить ID/название.
- **Кастомный №1 / Кастомный №2** — два независимых OpenAI-совместимых слота. Кастомный №2 стартует с пресетом DeepSeek (`https://api.deepseek.com/v1` + `deepseek-chat`), но его можно полностью изменить. Активный слот используется и в обычном чате, и в Termux-агенте.
- **OpenCode** и **Кастомный провайдер** — OpenAI-совместимые API; поддерживаются Base URL, Model ID, API-ключ и дополнительные JSON-заголовки. Для кастомного провайдера можно запросить список моделей.
- **Офлайн** — GGUF-модель через llama.rn; параметры контекста, CPU-потоков и GPU layers можно оставить авто или настроить вручную. После изменения параметров модель нужно перезагрузить в память.
- **Системный промт** применяется поверх встроенного IDE-промта и работает для онлайн- и офлайн-режимов.

### Интеллект агента
В Настройках → «Интеллект агента» доступны: **память проекта, Hashline, subagents, Reviewer, Advisor, AST, LSP/TypeScript, GitHub, Stream Rules, preflight и post-review**. Для структурных правок агент использует AST-инструменты, для безопасной работы с существующим текстом — Hashline, а диагностические/навигационные возможности LSP и GitHub подключаются через отдельные инструменты.

### Termux и новые системные дополнения
- В боковом меню отдельный экран **«Настройки Termux»**.
- Порядок: **Termux (рантайм)** — только статус/версия (без кнопки); **«Обновить окружение Termux»** — копирует `yes | pkg update -y && yes | pkg upgrade -y` в буфер и открывает Termux; далее карточки команд `pkg install termux-api -y`, `termux-setup-storage`, `echo "allow-external-apps=true" >> ~/.termux/termux.properties`, `termux-reload-settings` (каждая копирует команду и открывает Termux); затем **Termux On / Off**; ниже **Termux:Boot** и **Shizuku**.
- При **Termux On** диалог показывает описание и кнопки «Открыть настройки» / «Отмена» без списка команд (команды уже на экране).
- AI Builder может скачать APK дополнения из официального источника и передать его системному установщику Android. Если Android требует разрешение на установку неизвестных приложений, приложение открывает системные настройки и после возврата может повторить ожидаемую установку. При неудаче доступна ссылка на официальный источник для ручной установки.
- **Важно:** Termux и его плагины должны быть из одного источника подписи. Не смешивайте GitHub и F-Droid APK. Это особенно важно для Termux:Boot.

### Диагностика и история
- **Лог** поддерживает фильтры по уровню и источнику (`app`, `termux`, `native`, `console`, `network`, `agent`), Self Check, экспорт и очистку с подтверждением.
- **Checkpoint** можно восстановить, удалить по одному или удалить все checkpoint текущей сессии.
- Полный тест-план: `AIBuilder_TEST_PLAN.md`. Короткий smoke на устройстве: `DEVICE_SMOKE.md`. Changelog: `CHANGELOG.md`.

> Ограничение: автоматическую установку APK, системное окно разрешения «неизвестные приложения», работу Shizuku/Termux:Boot и полноценный Android runtime нужно проверять на реальном Android-устройстве. Локальные self-tests не заменяют физический тест.

---

## Изменения текущей версии

### v305

- Удалён отдельный пункт «Проект» и связанный с ним старый UI-конструктор.
- Удалены неиспользуемые проектные UI-артефакты и устаревшие проверки удалённого экрана.
- Сохранены ProjectContext, активный проект, проектные файлы и агентские инструменты, чтобы работа ИИ с проектом не прерывалась.

## Исторические изменения

### v19: вложение в поле ввода, глобальный системный промт, выбор модели OpenRouter

- **Файл/фото больше не улетает в чат сразу.** Выбор через 📎/🖼️ теперь
  только вешает индикатор (миниатюру фото или карточку файла) прямо в поле
  ввода — можно дописать текст и нажать "Отправить" (или убрать вложение
  крестиком). Отправляется ОДНО сообщение: текст + вложение вместе (см.
  `app/index.tsx`, `PendingAttachment`).
- **Настройки → "Системный промт".** Глобальные инструкции для ИИ,
  задаются в отдельном окне (кнопки "Сохранить"/"Очистить"), хранятся
  локально (AsyncStorage) и применяются и к офлайн-, и к онлайн-модели —
  дописываются после встроенного промта (см. `components/SystemPromptDialog.tsx`,
  `lib/local-model.ts`, `lib/online-model.ts`).
- **Настройки → "Модели OpenRouter"** (сразу под онлайн-моделью). Окно со
  списком бесплатных моделей OpenRouter (включая auto-роутер по умолчанию)
  и параметрами генерации (температура/токены/top-P) для онлайн-режима —
  см. `components/OpenRouterModelsDialog.tsx`, `lib/online-model.ts`
  (`FREE_OPENROUTER_MODELS`).
- Весь новый интерфейс переведён на все 3 языка приложения (uk/ru/en) —
  см. `lib/i18n.ts`.

## Возможности
- Одна офлайн-модель (Qwen3-VL 4B Instruct, GGUF) — код + понимание изображений/скриншотов, работает через llama.rn (llama.cpp), без интернета после скачивания
- Автоматическая генерация Android-проектов
- Автокомпиляция с исправлением ошибок
- Реверс-инжиниринг APK
- Сканер безопасности
- Git интеграция
- Live UI Preview
- Семантический поиск
- AI генерация иконок

## Сборка (Cloud Build Engine)

Ручной `npx expo prebuild` больше не требуется. После установки зависимостей
`postinstall` автоматически запускает `expo prebuild --platform android
--no-install`, если отсутствует `android/`. Корневой `./gradlew` дополнительно
проверяет наличие `android/gradlew` и делает тот же prebuild перед передачей
задачи настоящему Gradle wrapper.

Поэтому онлайн-сборщик может сразу выполнять свой стандартный Gradle/EAS
build. Настройки компиляции основного AI Builder при этом не изменяются.

```bash
pnpm install --frozen-lockfile   # prebuild выполняется автоматически
```

В ZIP для CBE есть корневой `./gradlew` (shim): он сам подготавливает
`android/` и только затем передаёт аргументы в `android/gradlew`.
**Не** добавляйте в `plugins` пакеты без config plugin (например `expo-clipboard` — только dependency).
Историческая запись: версия **1.3.160** / архив **v215**. Исторически были включены два lockfile; начиная с v228 каноническим является только `pnpm-lock.yaml`.

Канонический lockfile: `pnpm-lock.yaml`; это единственный поддерживаемый package manager/lockfile для проекта.

## Требования
- Expo SDK ~54.0.29
- React 19.1.0
- React Native 0.81.5
- pnpm 9.15.0 (канонический package manager; lockfile: `pnpm-lock.yaml`)

## Архитектура
- Expo Router v6 с Drawer навгацией
- React Native + TypeScript
- Material 3 Dark Theme

## Исправления v6
- Исправлено перекрытие клавиатурой поля ввода (KeyboardAvoidingView + плагин AndroidManifest)
- Добавлено боковое меню (Drawer) с 2 пунктами: Чат, Настройки
- Новые иконки из AI_Builder_Final_Icon.zip
- Расширен экран настроек с моделями ИИ, пакетами загрузки, кастомными URL
- Локальные модели: радио-кнопки (только одна активна), автозагрузка при включении
- Онлайн модели: несколько может быть включено одновременно
- Кнопка "+ Новый чат" в главном чате
- Кнопки прикрепления файла и изображения работают
- Рабочая папка: /storage/emulated/0/AI-Builder/

## v12: реальная офлайн-модель (вместо заглушки)

В предыдущих версиях `useLLM`/`useAppSettings`/`lib/llm-router.ts` только
имитировали ответы модели (`[Local LLM] ...`) и прогресс скачивания
(`setInterval` со случайным приростом) — реального инференса и загрузки
файлов не было. Теперь:

- **Модель:** [Qwen3-VL-4B-Instruct](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF),
  квантизация Q4_K_M (~2.5 ГБ) + vision-модуль mmproj Q8_0 (~454 МБ).
  Мультимодальная модель линейки Qwen3: пишет и объясняет код, понимает
  изображения/скриншоты. Подобрана под 8 ГБ ОЗУ — работает на CPU
  (`n_gpu_layers: 0`), не зависит от конкретного GPU-чипсета телефона.
- **Движок:** [`llama.rn`](https://github.com/mybigday/llama.rn) (React
  Native биндинг llama.cpp). Все остальные "модели" (Qwen 7B/3B, Phi-4,
  OpenAI/Gemini/Claude/DeepSeek) убраны из настроек — в приложении ровно
  одна офлайн-модель, как и просили.
- **Где смотреть код:** `lib/local-model.ts` (скачивание, загрузка в
  память, текстовый чат, анализ изображений), `hooks/useAppSettings.ts`
  (состояние модели в UI), `hooks/useLLM.ts` (чат), `app/settings.tsx`
  (кнопки "Скачать" / "Загрузить в память" / "Удалить").
- **Файлы модели** хранятся в приватной папке приложения
  (`Paths.document/models`) — на Android 13+ доп. разрешения не нужны.

### Важно перед сборкой
- Первая сборка (`pnpm install`) должна выполняться **с доступом в
  интернет** на компьютере разработчика — `llama.rn` скачивает нативные
  `.so`-библиотеки под Android в момент `postinstall`.
- Само приложение тоже качает модель (~3 ГБ) по кнопке в Настройках — это
  происходит на телефоне, один раз, дальше всё работает офлайн.
- Если сборка Android упадёт на плагине `llama.rn` с ошибкой вида
  `ERR_REQUIRE_ESM` / `Unable to resolve a valid config plugin` — это
  известная проблема совместимости конкретных версий `llama.rn` с Expo
  config plugins; используйте версию, зафиксированную в `package.json` и
  `pnpm-lock.yaml` (сейчас `llama.rn@0.12.0`). Не используйте `@latest`
  или непинованные версии: это нарушает воспроизводимость сборки.
- Устройство должно быть на архитектуре `arm64-v8a` (все современные
  телефоны, включая указанный Android 13) — `llama.rn` не поддерживает
  32-битные ABI.

## v14: исправлена онлайн-модель (404) + ошибки моделей теперь попадают в лог

### 1. Онлайн-модель больше не отвечала 404
`stealth/ox-alpha` был временным id на период закрытого тестирования
OpenRouter. Тестовый период закончился, и OpenRouter отвечает 404 с текстом
о том, что модель теперь называется `z-ai/glm-5.3-flash`. Заменён id модели
в `lib/online-model.ts` (`ONLINE_MODEL.id`) — название "Ox Alpha" в
интерфейсе оставлено прежним, поменялся только id, отправляемый в API.

### 2. Ошибки модели не попадали в экран "Лог"
`useLLM.ts` перехватывал ошибки `onlineModelEngine`/`localModelEngine`
внутри `try/catch` и просто возвращал текст `"Ошибка модели: ..."` как
обычный ответ ассистента — исключение никогда не долетало до `app/index.tsx`,
поэтому в лог ничего не писалось, и понять причину сбоя (404, неверный
ключ, нет сети, модель не загружена) можно было только по тексту в чате.
Теперь `useLLM.ts` сам логирует через `useLoggerContext`:
- `logError("OnlineModel"/"LocalModel", ...)` — реальный текст ошибки от
  OpenRouter/локальной модели (код, сообщение);
- `logWarn(...)` — "мягкие" случаи вроде отсутствующего API-ключа или ещё
  не загруженной офлайн-модели.

Откройте боковое меню → "Лог", чтобы увидеть точную причину любого сбоя
запроса к модели.

### 3. API-ключ OpenRouter
Ключ по умолчанию (`DEFAULT_OPENROUTER_API_KEY` в `lib/online-model.ts`)
используется как "сид"-значение при первом запуске и сохраняется в
`expo-secure-store`; реальный ключ в рантайме всегда читается оттуда
(см. `hooks/useAppSettings.ts`).

## v13: индикатор загрузки, автонастройка под телефон, онлайн-модель, чат

### 1. Исправлен индикатор загрузки модели (реальный прогресс)
Причина, по которой процент почти не двигался: код читал
`progress.totalBytesWritten` из колбэка `onProgress`, а у
`File.downloadFileAsync` (expo-file-system 19.x) поле называется
`bytesWritten`/`totalBytes` — из-за опечатки колбэк каждый раз получал
`undefined`. Теперь (`lib/local-model.ts`):
- процент считается от реальных `bytesWritten`;
- в Настройках под шкалой показывается `1.2 ГБ / 3.0 ГБ · 4.1 МБ/с` —
  скачано/всего и сглаженная скорость (`components/ProgressBar.tsx`).

### 2. Автоопределение параметров телефона + ручные настройки модели
- `lib/device-profile.ts` — через `expo-device` читает объём ОЗУ телефона
  и подбирает `n_ctx`/`n_threads`/`n_gpu_layers` (5 уровней, от слабых
  телефонов с <3 ГБ до флагманов с 10+ ГБ). Экран Настроек показывает
  модель телефона, ОЗУ и объяснение выбранных значений.
- В Настройках появился блок "Параметры модели" — контекст, потоки CPU,
  GPU-слои, температура, макс. длина ответа, Top-P можно менять вручную;
  кнопка "Сбросить на авто" возвращает подобранные под телефон значения.

### 3. Онлайн-модель — Ox Alpha через OpenRouter
`lib/online-model.ts` — новый клиент для `stealth/ox-alpha`
(openrouter.ai/stealth/ox-alpha), окно контекста 1 048 576 токенов,
поддерживает текст и изображения. API-ключ хранится в `expo-secure-store`
(защищённое хранилище устройства), поле ключа в Настройках скрыто
(👁 показать/скрыть). Ключ, переданный при постановке задачи, подставлен
как значение по умолчанию — **перед публикацией сборки замените его на
свой** (Настройки → Онлайн-модель → API-ключ).

### 4. Переключатель Офлайн/Онлайн с чекбоксами
На карточках офлайн- и онлайн-модели в Настройках — чекбоксы "Использовать
как активную модель" (`components/Checkbox.tsx`), включение одного
автоматически выключает другой (`mode` в `hooks/useAppSettings.ts`,
общий на всё приложение через `components/AppSettingsContext.tsx`).
Наверху экрана чата — быстрый переключатель `ModelModeSwitch` с тем же
состоянием и индикатором готовности каждого режима.

### 5. Чат: копирование, удаление, подсветка кода, файл из вставки
- Текст сообщений — `selectable` (`components/MessageContent.tsx`):
  системное выделение/копирование слова (двойной тап) и произвольного
  фрагмента работает "из коробки", без доп. кода.
- Под каждым сообщением (и вопросом, и ответом) — кнопки "Копировать" и
  "Удалить" (`components/ChatBubble.tsx`), с подтверждением перед
  удалением.
- Блоки кода (```java, ```xml, ```smali, ```c++ и т.д.) рендерятся
  отдельным компонентом с подсветкой синтаксиса и своей кнопкой
  "Копировать код" (`lib/code-highlight.ts`, `lib/markdown-lite.ts`,
  `components/CodeBlock.tsx`) — лёгкий самописный токенайзер без новых
  нативных зависимостей.
- Вставка большого фрагмента текста (от ~800 символов за раз) в поле
  ввода автоматически превращается в `.txt`-файл, прикреплённый к чату
  карточкой с кнопкой сохранения/шаринга (`lib/text-file.ts`).

### Новая зависимость
Добавлена `expo-device` (чтение ОЗУ телефона). Версия в `package.json` —
ориентировочная под Expo SDK 54; при необходимости выполните
`npx expo install expo-device`, чтобы подставить версию, точно
соответствующую вашей версии Expo.

## Termux-сессия — как это работает на самом деле

Кнопки "Termux On/Off" в боковом меню включают/выключают режим, в котором
ИИ сам решает, какие shell-команды выполнить, сам исправляет ошибки и
повторяет попытки, а в чат попадает только его финальный ответ. Полная
история всех выполненных команд и их вывод всё равно сохраняются на экране
"Лог" — технически ничего не скрывается от вас навсегда, просто в обычном
чате не показывается сырой терминал.

**Важно понимать границы этой реализации:**

- Это НЕ полноценное ядро Termux, встроенное внутрь этого приложения.
  Termux — отдельное Android-приложение со своим bootstrap-окружением
  (busybox, apt-подобный пакетный менеджер, свой терминальный эмулятор на
  нативном коде). Встроить его исходники в этот Expo-проект и при этом
  собирать всё "онлайн" без ошибок — нереалистично: это отдельный,
  самостоятельный проект на много месяцев работы.
- Вместо этого добавлен **мост к уже установленному отдельно Termux**
  через официальный, документированный механизм Termux:API —
  `RUN_COMMAND` (см. `plugins/withTermuxBridge.js`, `lib/termux-bridge.ts`).
  Наше приложение отправляет команду в Termux, Termux её выполняет в своём
  окружении и пишет результат (stdout/stderr/код возврата) в общую папку
  на диске, наше приложение читает его оттуда.
- Termux **сознательно** не позволяет сторонним приложениям выполнять в
  нём команды, пока пользователь сам не включит это явно — это защита от
  того, чтобы любое приложение на телефоне могло втихую слать команды в
  чужой терминал. Обойти это нельзя и не нужно: это ваш собственный
  осознанный шаг, который делается один раз.

### Разовая настройка (один раз, вручную)

1. Установите отдельно приложение **Termux** и **Termux:API** — с F-Droid
   (в Google Play официальная версия Termux не поддерживается разработчиками).
2. Откройте Termux хотя бы один раз и выполните:
   ```
   pkg update && pkg upgrade
   pkg install termux-api
   termux-setup-storage
   echo "allow-external-apps=true" >> ~/.termux/termux.properties
   termux-reload-settings
   ```
3. В нашем приложении включите "Termux On" в боковом меню — оно запросит
   разрешение `RUN_COMMAND` и (на Android 11+) откроет системный экран
   "Доступ ко всем файлам" для этого приложения — это разрешение нужно,
   чтобы прочитать вывод команд, которые пишет процесс Termux (другое
   приложение) в общую папку на внешнем хранилище.
4. Если после этого включение всё равно не проходит — приложение
   покажет, какого именно шага не хватает (Termux не установлен /
   разрешение не выдано / доступ к файлам не выдан).

### Протокол ИИ ↔ Termux

Модели (и локальной, и онлайн) в режиме сессии дополнительно подставляется
системный промт-протокол (см. `t("termuxAgentSystemPrompt")` в
`lib/i18n.ts`): модель отвечает либо `TERMUX_RUN:\n<команда>`, либо
`TERMUX_DONE:\n<итог для пользователя>`. Агентный цикл
(`lib/termux-agent.ts`) выполняет команду через `lib/termux-bridge.ts`,
отдаёт модели результат как следующую "реплику" и повторяет, пока модель
не пришлёт `TERMUX_DONE` или не будет достигнут лимит шагов (по умолчанию
25, см. `hooks/useLLM.ts`).


## v133 cache
APK builds reuse the persistent Termux/Gradle/npm dependency caches and only install/download missing or changed components.


## v134 recovery/cache fix
- Fixed generated Termux harden script syntax error in SettingsManager patch (removed unsafe embedded Python one-liner).
- Recovery attempts increased to 12.
- Provider rate-limit/timeout failures are logged as provider limitations and are never treated as successful builds.
- Checkpoints moved to storage key v3 so stale v2 checkpoints from previous builds are not shown.
- Version 1.3.87.


## DSHA integration

Runtime lifecycle, transaction journal, backup/restore, diagnostics, recovery, device bridge and native ADB-session watchdog are documented in `docs/dsha-phase2-device-runtime.md`.

## DSHA Phase 3 — device application loop

The runtime now exposes a deterministic device loop:

`build APK -> ADB install -> launch -> binary-safe screenshot capture -> logcat`

Agent tools:
- `device.status`
- `device.shell`
- `device.install`
- `device.launch`
- `device.screenshot`
- `device.screenshot.base64`
- `device.logcat`
- `device.tap`
- `device.swipe`
- `device.app_loop`

Screenshots are captured with `adb exec-out screencap -p` rather than routing PNG bytes through JSON. The optional shared-path export is written by Termux directly. The base64 variant is intended for a future multimodal/vision adapter.

The runtime UI exposes the same flow as an explicit user action; it does not silently install or launch arbitrary packages.

## DSHA Phase 12 — Production Deployment Manager

Phase 12 adds a bounded deployment controller for already Release-Gate-approved channel artifacts. It installs the selected channel release through the existing DeviceAgentBridge, resolves/validates the Android package name, launches the app, checks `pidof` and the accessibility hierarchy, persists deployment state atomically, and automatically reinstalls the previous deployed channel artifact when the new version fails its health check. No arbitrary model-generated shell is accepted; package names are validated and all deployment actions use the existing device capability boundary.

Deployment state is stored under `artifacts/deployments/<channel>.json`.

## DSHA Phase 16 — Fleet Command Center

Adds a local fleet command center with per-device status, release history, deploy/rollback controls, observability summary and incident visibility. See `docs/dsha-phase16-fleet-command-center.md`.

## DSHA Phase 17

Fleet Policy & Access Control: local role policy, production confirmation and audit log for fleet operations. See `docs/dsha-phase17-fleet-policy-access-control.md`.

## Phase 23 — Fleet Alert Escalation & Notification Center

Adds a local, secret-free fleet alert escalation layer over the Phase 22 SLO dashboard:
- stable alert fingerprints and deduplication;
- warning/critical escalation from fleet incidents, failure rate, stale recovery state and repeated recovery failures;
- acknowledgement timeouts with automatic re-escalation;
- local notification outbox and tamper-auditable escalation log;
- configurable escalation policy with bounded values;
- Runtime UI actions for escalation, ACK and RESOLVE.

Notification adapters are intentionally local-only in this phase; no external credentials or push secrets are stored in the project.

## Phase 26 — Linux Runtime

AI Builder now exposes a runtime-level Linux userspace adapter for Android/Termux. The primary backend is `proot-distro` (rootless); a local rootfs fallback is also supported. Linux commands are restricted to an explicit allowlist, workspaces are mounted at `/workspace`, working directories are bounded, and command timeouts are enforced. No Linux credentials or external notification secrets are persisted by the runtime.

Runtime API: `linuxStatus()`, `linuxExec()`, `linuxBootstrap()`.

Bootstrap is explicit and maintenance-gated; the app does not silently download a Linux distribution.
