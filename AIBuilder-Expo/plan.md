# План внедрения идей DSHA в AI Builder (до финала)

**Дата:** 2026-09-25  
**База сравнения:** архитектура DSHA (DeepSeek Harness Android / DSH-APP) vs **AI Builder 1.5.5**  
**Принцип:** переносим *паттерны и поведение*, не копируем proprietary-код (proroot, GeckoView UI, закрытые бинарники). Всё новое — с нуля под Expo/RN + Termux.

---

## 1. Что такое DSHA (кратко)

DSHA — Android-оболочка вокруг локального Linux-userspace и агента DeepSeek Harness:

| Слой | Суть |
|------|------|
| UI | Material3 + GeckoView (web UI агента) |
| Keep-alive | Foreground Service + watchdog + уведомления |
| Runtime | Ubuntu rootfs + Node; **proroot** (LD_PRELOAD, без ptrace) / fallback **proot** |
| Bootstrap | Стадийная установка RUNTIME → DSH → NATIVE → UI, resumable, SHA-проверки |
| Диагностика | ~23 self-check + one-tap repair + скрипты self-heal |
| Backup | Staging, integrity (SHA), безопасный restore |
| Device | ADB / Shizuku / root-цепочки для управления телефоном |
| Данные | Долгоживущие каталоги, переживают переустановку (в их модели) |

**Лицензионный стоп-кран:** `libproroot.so` и модифицированные бинарники — proprietary («Redistribution of modified binaries is not permitted»). В AI Builder **запрещено** вендорить.

---

## 2. Что уже есть в AI Builder 1.5.5

### 2.1 Runtime control plane (уже сильнее DSHA по открытости)

| Компонент | Файлы / место | Статус |
|-----------|---------------|--------|
| Maintenance gate + drain | `RuntimeTaskGate` | ✅ |
| Транзакции prepare→commit/rollback | `RuntimeTransaction` | ✅ |
| Журнал + recovery pending | `RuntimeJournal`, `recoverPendingTransactions` | ✅ |
| Координатор maintenance | `RuntimeMaintenanceCoordinator` | ✅ |
| Identity / migration boundary | `RuntimeIdentity` | ✅ |
| Supervisor / watchdog процессов | `RuntimeSupervisor` | ✅ (логика; FS Android — отдельно) |
| Userspace multi-backend | `AibUserspaceRuntime`, `RuntimeBackendRouter`, backends | ✅ (open alternative to proroot) |
| Backup format 2 + safe restore | `BackupManager`, `BackupIntegrity`, `RestoreTransaction` | ✅ |
| Diagnostics + RepairManager | `DiagnosticRule`, `LiveProbes`, `RepairManager`, `RuntimeHealth` | ✅ |
| Deterministic repair recipes | `DeterministicRepair`, `repair-script-runner` | ✅ |
| StartupTrace + FailureJournal | `StartupTrace`, `FailureJournal` + UI | ✅ |
| Agent protocol hardening | `termux-agent` invalidStreak / ABORT | ✅ |
| Free models (OpenCode) | снята hard-block | ✅ |
| Runtime screen UX | иконки, help, auto-probe, Health, journal | ✅ |

### 2.2 То, чего у DSHA нет / слабее, а у AI Builder уже есть

- Полноценный **Termux agent** (TERMUX_RUN/DONE, scripted build, APK pipeline)
- **OpenRouter / offline GGUF / multi-provider** LLM
- **One-Click App Factory**, agentic build loop, project memory
- **Device fleet / release gate / canary** (фазы dsha-phase* в `docs/` — часть уже в коде)
- Expo Router UI, i18n ru/uk/en, compilation-settings guard

### 2.3 Сознательно не переносим

| DSHA | Почему нет в AI Builder |
|------|-------------------------|
| Proprietary **proroot** | Закрытая лицензия; заменён router + proot-distro |
| GeckoView + dsh web UI | Другой продукт (чат AI Builder ≠ dsh web) |
| Встроенный full rootfs в APK | Модель AI Builder = Termux на устройстве пользователя |
| Java Activity / Material3 shell | Стек Expo/RN |

---

## 3. Матрица пробелов (gap analysis)

| Область DSHA | В AI Builder сейчас | Gap | Приоритет |
|--------------|---------------------|-----|-----------|
| Permanent Foreground Service (сборка/агент/inference) | `foreground-task` трекер + Settings survival; нет полноценного Android FS для всех long jobs | Связать native FS (если есть плагин) с видами задач | **P0** |
| Watchdog перезапуска «умерших» runtime-процессов | `RuntimeSupervisor` по registry; слабая связь с Termux PID | PID/session health + restart policy | **P0** |
| ~23 named self-checks + one-tap UI | Health + LiveProbes + journal; набор правил ещё неполный | Расширить rules (disk, HOME layout, bridge, NDK, licenses) | **P0** |
| 15 self-healing scripts | Recipes + script-runner patches | Каталог allowlisted `.sh` в `scripts/repair/` + runner | **P0** |
| Bootstrap stages resumable + SHA layers | Rootfs ensure / proot install ad-hoc | Единый `BootstrapPipeline` со стадиями и fingerprint | **P1** |
| Backup UI «как продукт» | API + Runtime card | Экран/флоу: список бэкапов, verify, restore wizard | **P1** |
| ADB без боли + pairing UX | `TermuxAdbDeviceBridge`, device loop | Wizard pairing, keep-alive adb, понятные ошибки | **P1** |
| Shizuku / elevated shell | Privilege providers (частично) | Реальный bridge + health rule | **P2** |
| Open native accelerator (аналог proroot) | Только roadmap в docs | Опциональный open C/JNI backend priority 5 | **P2** |
| Данные «переживают uninstall» | HOME на `/storage/.../AIBuilderTermux` | Политика путей + export/import zip профиля | **P2** |
| Диагностика «кто сломал web UI» | N/A (нет dsh web) | — | skip |
| Notification progress для bootstrap | app-notifications частично | Единый progress channel для bootstrap/backup/build | **P1** |

---

## 4. Целевая архитектура AI Builder (финал внедрения)

```
┌──────────────────────── AI Builder (Expo RN) ────────────────────────┐
│ Chat / Settings / Runtime / Script Runner / Log                      │
│ AppLayout → StartupTrace → journal recover → markReady               │
├──────────────────────────────────────────────────────────────────────┤
│ RuntimeFacade                                                         │
│  ├ TaskGate + Transaction + Journal + MaintenanceCoordinator         │
│  ├ BootstrapPipeline (stages, fingerprints, resume)          [DONE]  │
│  ├ Health (rules++) + FailureJournal + Repair (+ scripts/)   [expand]│
│  ├ BackupManager format2 + Restore wizard                    [UI]    │
│  ├ AibUserspaceRuntime (termux-native | proot-distro | [accel])      │
│  ├ Supervisor ↔ Termux session health                        [DONE]  │
│  └ Device bridge (ADB wizard, optional Shizuku)              [expand]│
├──────────────────────────────────────────────────────────────────────┤
│ Termux agent: protocol strict + DeterministicRepair hints            │
│ Foreground: native FS for build/agent/bootstrap + survival settings  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## 5. Поэтапный план до финала

### Фаза A — Keep-alive и наблюдаемость процессов (P0)

**Цель:** долгие сборки/агент не убиваются OEM; падения видны и восстанавливаются.

| # | Задача | Как внедрить | Критерий готовности |
|---|--------|--------------|---------------------|
| A1 | Единый **Foreground work API** | Расширить `lib/foreground-task.ts` + вызов native FS (существующий plugin/watchdog), виды: `build`, `agent`, `bootstrap`, `backup` | Сборка/агент держит FS notification |
| A2 | **Termux session health** | Probe `id`/echo через bridge; при fail → FailureJournal + UI | Правило `runtime.termux-session` |
| A3 | **Supervisor policy** | Restart limit, backoff, связь с ProcessRegistry metadata `watchdog=true` | Документированный policy + selftest |
| A4 | Battery survival UX | Уже manual в Settings; добавить reminder после 2-й убитой сборки | Не auto-open settings (регрессия UX запрещена) |

**Не трогать:** настройки компиляции проекта; auto `ensureBackgroundSurvival` на cold start.

---

### Фаза B — Полный каталог диагностики и repair (P0)

**Цель:** паритет «23 checks + scripts» по смыслу, не 1:1 имена.

| # | Задача | Новые/изменить файлы | Критерий |
|---|--------|----------------------|----------|
| B1 | Rules: disk free, HOME layout, Termux bridge, proot-distro, Java, Gradle, Node, SDK, aapt2, adb, journal-pending, userspace router | `core/diagnostics/rules/*` | ≥15 правил в Health |
| B2 | Каталог **allowlisted** repair scripts | `scripts/repair/*.sh` + whitelist в `repair-script-runner` | Только из списка, risk low/medium |
| B3 | One-tap repair в UI | Runtime Health + per-item journal (частично есть) | Каждое repairable → действие |
| B4 | Отчёт Health export | JSON в `home.logs/health-*.json` | Кнопка «Export» на Runtime |

---

### Фаза C — Bootstrap pipeline (P1)

**Цель:** как у DSHA — стадии, resume, проверка integrity; **без** закрытого proroot.

| Стадия | Действие | Fingerprint |
|--------|----------|-------------|
| 1. termux-ready | bridge + `pkg` | probe ok |
| 2. tools-base | openjdk, unzip, git, node (по необходимости) | `command -v` |
| 3. proot-distro | install package | version string |
| 4. debian-image | `proot-distro install debian` | rootfs marker file |
| 5. workspace | HOME layout ensure | paths exist |
| 6. verify | uname + id внутри debian | stdout match |

| # | Задача | Файлы |
|---|--------|-------|
| C1 | `core/runtime/BootstrapPipeline.ts` | state machine + persist stage in metadata |
| C2 | UI на Runtime: прогресс стадий + «Продолжить» | `app/runtime.tsx` |
| C3 | Уведомления прогресса | `lib/app-notifications` |
| C4 | Selftest стадий (mock exec) | `scripts/aib-bootstrap-pipeline-selftest.mjs` |

---

### Фаза D — Backup как продукт (P1)

| # | Задача | Детали |
|---|--------|--------|
| D1 | Список бэкапов (scan destination parent) | UI + adapter list |
| D2 | Verify (manifest + digest) без restore | кнопка Verify |
| D3 | Restore wizard: inspect → pre-backup path → confirm → result | уже есть API RestoreTransaction |
| D4 | Scope picker: full / projects / sessions / toolchains | UI |

---

### Фаза E — Device bridge до «можно пользоваться» (P1)

| # | Задача |
|---|--------|
| E1 | ADB pairing wizard (wireless): шаги, ошибки на русском |
| E2 | Health rule `device.adb` уже есть — живой probe устройств `adb devices` |
| E3 | Сохранение last device serial в settings |
| E4 | Документ: когда нужен USB vs wireless |

---

### Фаза F — Agent ↔ runtime (P1)

| # | Задача |
|---|--------|
| F1 | При HEALTH_ERROR toolchain — авто-подмешивать `[DETERMINISTIC_REPAIR]` (частично есть) | усилить покрытие |
| F2 | При `AGENT_PROTOCOL_ABORT` — soft prompt сменить модель (есть текст) | опционально deep-link в Settings |
| F3 | Script Runner: все memory/NDK/toolchain патчи остаются **детерминированными** | без LLM-shell |

---

### Фаза G — Опциональный native accelerator (P2, не блокер финала)

| # | Задача |
|---|--------|
| G1 | Спека интерфейса `RuntimeBackend` id=`aib-native-accel` priority 5 |
| G2 | Отдельный open-source C/JNI репозиторий (MIT/Apache), без DSHA blobs |
| G3 | Probe fail → router fallback (уже заложено) |

**Финал продукта не зависит от G.**

---

### Фаза H — Финальная приёмка (Definition of Done)

1. Все selftests: transaction, userspace, live-health, agent-protocol, repair-runner, failure-ui, bootstrap (после C), compilation-guard.  
2. Холодный старт: **не** открывает battery settings сам.  
3. Runtime: Linux/Health/Journal понятны без документации.  
4. Сборка APK через агента: при BROKEN gradle/java — срабатывает deterministic repair, не бесконечный reasoning loop.  
5. Backup create → inspect → restore с pre-backup на тестовых данных.  
6. Нет proprietary бинарников в репозитории.  
7. `package.json` version + identity + guard baseline синхронны.  
8. Документы: этот `plan.md` + обновлённый `docs/HARDENING_1_4_x.md` / release notes.

---

## 6. Порядок работ (рекомендуемый roadmap)

```
A (keep-alive + supervisor) ──┐
B (diagnostics catalog)     ──┼──► C (bootstrap) ──► D (backup UX) ──► E (ADB UX)
F (agent glue)              ──┘         │
                                        ▼
                              H (acceptance)     G (native accel, optional)
```

**Оценка объёма (ориентир):**

| Фаза | Объём |
|------|--------|
| A | 2–4 итерации архива |
| B | 2–3 |
| C | 2–4 |
| D | 1–2 |
| E | 1–2 |
| F | 1 |
| H | 1 (стабилизация) |

Версии: продолжать **1.5.x → 1.6.x** по фазам (минор на завершённую фазу).

---

## 7. Правила внедрения (жёсткие)

1. **Не менять** настройки компиляции AI Builder (кроме version + guard baseline).  
2. **Не** добавлять proprietary proroot / закрытые `.so`.  
3. Repair shell — только **allowlist** / recipes; LLM не генерирует произвольный repair.  
4. Background survival — только **явное** действие пользователя (или мягкий reminder), не cold-start redirect.  
5. Каждый блок — selftest `scripts/aib-*-selftest.mjs` + запись в CHANGELOG.  
6. Архив: версия zip +1 (`AIBuilder-Expo-vN`).  
7. Код «лучше DSHA» = открытость, метрики, router, тесты; не копирование Java/UI.

---

## 8. Соответствие «что взять из DSHA» → «куда в AI Builder»

| Идея DSHA | Внедрение в AI Builder |
|-----------|------------------------|
| RuntimeTasks barrier | `RuntimeTaskGate` + `RuntimeTransaction` ✅ / усилить A3 |
| Recovery transaction log | `RuntimeJournal` + FailureJournal ✅ / B |
| Staged backup + SHA | format 2 + RestoreTransaction ✅ / D UI |
| Self-check + repair | Health + recipes ✅ / B expand |
| proroot speed | **Не копировать**; userspace router ✅ / G optional open accel |
| Foreground + watchdog | A1–A3 |
| Bootstrap layers + resume | C BootstrapPipeline |
| ADB device control | Device* ✅ / E wizard |
| 23 diagnostics | B1 catalog |
| Survive uninstall data | HOME policy + export profile P2 |

---

## 9. Текущая точка на карте

**Сейчас (1.6.7):** A3 SupervisorPolicy + FG sticky; F offline/recipe; H harness; Phase F+H acceptance harness;  Phase E ADB wizard;  Phase D Backup UI;  Phase C BootstrapPipeline;  Phase B rules+scripts;  Phase A (termux-session, disk, FG tasks);  Debian progress + export/import;  control plane runtime, diagnostics base, userspace router, agent protocol, Runtime UX, failure journal UI, free models — **фазы A–F частично закрыты на уровне ядра.**

**До финала:** добить **A (FS/supervisor)**, **B (полный каталог checks/scripts)**, **C (bootstrap pipeline)**, **D–E (UX продукта)**, приёмка **H**.

---

## 10. Следующий конкретный шаг

Начать **Фазу A1–A2**:  
1) связать `withForegroundTask` с реальным native foreground (или чётко задокументировать stub + TODO native);  
2) DiagnosticRule `runtime.termux-session` + запись в FailureJournal;  
3) selftest + archive 1.6.0.

---

*Документ живой: обновлять статусы ✅/🔄/⏳ по мере внедрения. Источник истины по коду — репозиторий AI Builder, не upstream DSHA.*


---

## 9. Статус закрытия (1.6.7)

| Фаза | Статус | Примечание |
|------|--------|------------|
| A Keep-alive / observability | ✅ | FG tasks + sticky notify; termux-session; SupervisorPolicy |
| B Diagnostics + repair | ✅ | git/unzip/debian rules + scripts/repair |
| C BootstrapPipeline | ✅ | stages + fingerprint resume + UI |
| D Backup product | ✅ | list / verify / scope / restore UI |
| E ADB wizard | ✅ | pair + connect + human errors |
| F Agent ↔ repair | ✅ | recipe intercept + health hints |
| G Native accel | ⏭ optional | not required for DoD |
| H Acceptance | ✅ harness | `npm run test:acceptance` |

**Финал плана (ядро):** закрыт на уровне исходников. Остаётся проверка на устройстве (Bootstrap, Backup, ADB, Health).
