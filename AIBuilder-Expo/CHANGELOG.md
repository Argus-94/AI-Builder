## v179 (2026-09-27)
- build-loop.ts: escape shell `${BT%/}` inside TS template literal (Metro/Babel Unterminated regular expression)
- full codebase parse check: 357 .ts/.tsx files OK

## v178 (2026-09-27)
- Runtime (Среда): ADB Pair/Connect validate empty fields with RU/UK/EN hints
- Runtime: logcat wires Termux ADB bridge; friendly message when device unavailable
- Runtime: Linux status/check and proot-install errors explain Termux allow-external-apps
- Runtime: bind-active clearer “no project” message
- UnavailableDeviceAgentBridge: command methods resolve exitCode=1 instead of reject (safer UI)

## v177 (2026-09-27)
- APK recovery: deterministic tryAutoRepair(clusterFailure) before LLM repair agent; continue outer loop on recipe ok
- isApkBuildTask: path + build verb → APK pipeline even without "gradle" keyword

## v176 (2026-09-27)
- extractProjectPath: accept any /storage|/sdcard|/data project path (not only Download/AIBuilderTermux)
- extractProjectPath: relative Documents/Документы/*.zip
- apkEnvPrefix: SDK discovery accepts build-tools-only installs

## v175 (2026-09-27)
- termux-agent: assembleTask chosen before UI publish; activity shows real task name
- collect: pick newest APK/AAB by mtime across release+debug+bundle (not release-first)
- agent-recovery: NO_APK_OUTPUT / success-but-no-apk category

## v174 (2026-09-27)
- collect: soft-accept success when APK_PATH/markers present even if exit≠0; RAW_APK/UNSIGNED_APK_OK path match; aapt dump || true
- create-app: wget fallback for gradle-wrapper.jar download

## v173 (2026-09-27)
- prepare Expo scan: skip node_modules package.json; require expo|react-native dep (safe grep pattern)
- prepare unzip: log UNZIP_INNER_ROOT when single top-level dir; tree includes package.json

## v172 (2026-09-27)
- agent-engine create-app: stale lock clear if age>10min and no Gradle process; --max-workers=2 on assemble
- agent-engine: SDK discovery accepts build-tools-only installs (platforms optional for path selection)
- termux-agent offlineFailed: Could not download / distribution not found / Could not install Gradle

## v171 (2026-09-27)
- expo: broader CLI discovery (@expo/cli, expo-cli, .bin with node shebang check)
- agent-recovery + agent-trace: EXPO_CLI_MISSING / NODE_MODULES_INSTALL_FAILED / EXPO_PREBUILD_FAILED
- collect: early APK_PATH= echo; clearer SIGN_FAILED when no payload

## v170 (2026-09-27)
- expo: pnpm retry after lock/failure without --frozen-lockfile (lock out-of-sync recovery)
- assemble lock: clear stale lock if age>10min and no Gradle process (or age>45min absolute)
- prepare SRC: Documents ↔ Документы path alias

## v169 (2026-09-27)
- agent-recovery: classify NO_VERIFIED_GRADLE_WRAPPER / NO_WRAPPER / JAVA_MISSING explicitly
- agent-trace clusterFailure: map wrapper miss → gradle-wrapper recipe; aapt2 Permission denied → aapt2-sdk
- termux-agent hasVerifiedApkPath: broader /storage|data|sdcard paths; require .apk on AIB_DETERMINISTIC_APK

## v168 (2026-09-27)
- termux-agent OOM online retry: GRADLE_OPTS + single -Dorg.gradle.jvmargs without internal spaces (safe unquoted expand)
- termux-agent collect: BT="${BT%/}"; prefer SDK build-tools zipalign/apksigner over PATH; only fallback to command -v if empty
- build-loop signApkV123: normalize BT trailing slash

## v167 (2026-09-27)
- termux-agent: tighten gradleOk (require BUILD SUCCESSFUL or gradle_ec=0; reject BUILD FAILED)
- termux-agent: sourceOnlyFail — do not skip online on aapt2/resource linking/Permission denied; drop loose .java:.kt: path matches

## v166 (2026-09-27)
- termux-agent: fix TS syntax — shell `#` comments → `//` (lines that broke Metro: noexec note, AAB note, closes else of REUSE)
- Full Babel parse of lib/hooks/components/app/core/plugins/theme: 357/357 OK

## v165 (2026-09-27)
- agent-engine REUSE gradlew/properties: fix JS string quoting (match REUSE=0 escapes; close "; fi" inside double-quoted string)

## v164 (2026-09-27)
- termux-agent: skip online assemble when offline failure is source-only (cannot find symbol / Unresolved reference / .java:.kt: errors)
- repair aapt2-sdk: chmod +x found aapt2; try sdkmanager build-tools if missing
- repair gradle-pkg: restore gradle-wrapper.jar + gradlew into current proj_path

## v163 (2026-09-27)
- agent-engine: fix broken JS string quoting in REUSE gradlew + wrapper.properties writers (unescaped " inside "...")
- Matches REUSE=0 escaped form; prevents Metro/Babel SyntaxError on create-app REUSE path

## v162 (2026-09-27)
- build-loop.ts: escape shell ${ZIPALIGN:-no}/${APKSIGNER:-no} inside JS template literals (Metro SyntaxError fix)
- Syntax scan: no remaining unescaped shell ${VAR:-} in backtick strings (lib/*.ts)

## v161 (2026-09-27)
- applicationId segment: force letter-start (avoid com.aibuilder.2048 invalid id)
- Expo REUSE android/: require settings.gradle* (partial prebuild → --clean)
- agent-engine packageName: sanitize each segment as Java identifier

## v160 (2026-09-27)
- aapt2FromMavenOverride in deterministic create-app (scaffold + REUSE + CLI -P)
- aapt2FromMavenOverride in termux-agent apkRunAssemble and build-loop
- create-app Gradle heap raised 512m → 1536m (align with assemble paths)
- APK-BUILD-ISSUES-v160.txt: full simulation report of APK-from-scratch / from-source chains

## 1.7.9 — REUSE assemble hardening

- On REUSE: ensure gradlew + wrapper.properties if missing.
- Pick newest APK by mtime after assemble.
- pkgSuffix capped to 24 chars.

## 1.7.8 — Reuse existing create-app project (no silent wipe)

- Deterministic scaffold: REUSE if project exists; wipe only forceFresh.
- forceFresh when task has: с нуля / заново / from scratch / пересоздай.
- On REUSE: keep sources, refresh local.properties + assemble only.

## 1.7.7 — Follow-up refine after APK (добавь / пересобери)

- termux-intent: refine-app (добавь кнопку, доработай логику, пересобери).
- isChatOnly: same patterns → not chat-only.
- Agent priorChat: find project under AIBuilderTermux, edit in place, no new scaffold.

## 1.7.6 — Scaffold shows app name for free-form wishes

- Deterministic UI TextView/strings use app name (Timer etc.), not Hello World.
- Success message notes scaffold + optional follow-up for logic.
- Incomplete create-app priorChat includes User wish.

## 1.7.5 — «Создай» stems parity with «Напиши»

- Create verbs: создай|создать|создадим|создайте|создал|создам everywhere.
- Free-form wishes work with Создай таймер / Создай приложение для …
- «Создай стих» is not strong create-app (no product/app signal).

## 1.7.4 — Free-form «Напиши …» wishes route to agent

- isStrongCreateAppTask: soft products (таймер, трекер, заметки, игра…) + на android + UI hints.
- guessAppNameStrong: derive folder name from free-form wish (translit).
- isChatOnlyMessage / termux-intent: same free-form patterns → not chat-only.
- Pure chat (стих, список умений) still chat-only.

## 1.7.3 — Model: chat-only must not swallow create-app

- isChatOnlyMessage: "напиши … приложение/apk/hello world" → agent.
- useLLM: strongCreateEarly disables chatOnly gate.
- isStrongCreateAppTask: bare android counts as app target.

## 1.7.2 — Model: premature DONE on create-app + real repair scripts

- isPrematureApkDone also for isStrongCreateAppTask (Hello World etc.).
- isApkOrAppBuildTask includes strong create-app.
- hasVerifiedApkPath: APK_PATH= / AIB_DETERMINISTIC_APK=.
- SCRIPT_BY_RECIPE: local-properties (multi-path SDK + proj_path) and gradle-wrapper restore.

## 1.7.1 — Model: recovery lastFailure + gradleOk + wrapper classify

- Do not overwrite on-disk verify failure with generic sign failure.
- offlineFailed includes SKIP_OFFLINE / NO_WRAPPER.
- Gradle success: BUILD SUCCESSFUL or gradle_ec=0.
- classifyBuildError maps NO_WRAPPER_JAR → gradle-pkg.
- UI stage error when post-collect verify fails.

## 1.7.0 — Model: absolute APK + on-disk verify on autonomous success

- Autonomous APK success only after verifyApkOnDevice (size + exists).
- collect: newest APK by mtime, absolute path, multi-path build-tools SDK.
- build.run: heavy gradle/assemble up to 20 min timeout.

## 1.6.99 — Model zip/source success path + no-src guide

- apkEnvPrefix: multi-path SDK (aligned with assemble env).
- Collect: APKSIGNER_FAIL → unsigned; success accepts UNSIGNED_APK_OK.
- Autonomous APK success/exhausted closes AgentTrace.
- isApkBuildTask without path: priorChat asks for real path (no invent).
- guessAppNameStrong: todo/snake/test/mini aliases.

## 1.6.98 — Source/zip APK pipeline modeling fixes

- prepare: write local.properties; restore gradle-wrapper.jar
- apkGradleEnvLines: multi-path SDK discovery
- apkRunAssemble: restore wrapper before fail
- collect: soft zipalign/sign → unsigned APK still delivered
- extractProjectPathFromTask: /sdcard/ + Download

## 1.6.97 — APK build chain audit fixes

- Deterministic scaffold: no appcompat; gradle.properties; AGP8 settings; dynamic compileSdk; wrapper recovery; APK size check in shell.
- Toolchain: require android.jar; ok fails on sdk_platforms=MISSING.
- isApkBuildTask no longer hijacks pure create-from-scratch.
- Offline assemble timeout 600s.
- See APK-BUILD-AUDIT-REPORT.txt

## 1.6.96 — Close remaining incomplete agent-trace paths

- Create-app first: on-disk verify BEFORE marking pipeline done / success UI.
- Step-budget extension: parent agentTrace closed (abort) before recursive continue.
- closeAgentTrace() on user abort, wall-clock timeout, model errors, command failures, step limit.

## 1.6.95 — Finish incomplete APK verify paths

- Shared verifyApkOnDevice (exists + size ≥ 8KB).
- Deterministic create-app success verifies on disk before reporting success.
- Final create-app engine: verify APK; fail path persists fail-trace.
- Step-limit exit finalizes agentTrace as fail.
- LLM TERMUX_DONE uses the same helper (no duplicated shell).

## 1.6.94 — APK size gate, DONE size line, trace stats

- On-disk APK verify also rejects files < 8KB (APK_TOO_SMALL).
- Successful DONE appends size + absolute path when verified.
- Session Replay: pass/fail/abort counters for Agent Traces.
- Chat-only skip logs the message snippet for debugging.

## 1.6.93 — APK on-disk verify + regression hints + self-checks

- Before accepting TERMUX_DONE with APK path: test -f on device (AIB_APK_EXISTS / MISSING).
- buildRegressionHintsForTask: inject promoted fixtures + recent fails into agent context for build tasks.
- Self-checks: agent_gates + agent_fail_to_pass.

## 1.6.92 — Promote fixture + fail-to-pass + gate in chat activity

- promoteTraceToFixture / loadPromotedFixtures / removePromotedFixture (AsyncStorage).
- Session Replay: ★ Promote → fixture on failed traces; list + remove promoted fixtures.
- evaluateFailToPassContract + runFailToPassSelftest; selftest covers fail-to-pass.
- STRUCTURAL_GATE_FAIL publishes onActivity (visible in thinking panel timeline).

## 1.6.91 — Trace export, log banner, routing selftest

- Log export includes === Agent Traces === (last 12) with steps/gates/clusters.
- Log screen: LAST AGENT TRACE banner (status, task, summary, cluster).
- Deterministic create-app incomplete → fail trace persisted.
- scripts/aib-agent-routing-selftest.mjs + pnpm test:agent-routing.

## 1.6.90 — AgentTrace UI + auto-repair from clusters/gates

- Session Replay: Agent Traces list with expandable step timeline, gates, APK path, failure cluster.
- Auto-repair uses clusterFailure when classifyBuildError is null.
- STRUCTURAL_GATE_FAIL can trigger tryAutoRepair once (recipe from cluster).
- Deterministic create-app success persists a pass trace.

## 1.6.89 — AgentTrace, structural gates, failure clusters

- lib/agent-trace.ts: structured traces, structural DONE gates, failure cluster→recipe, persist last 20 traces.
- termux-agent: record each command; reject DONE that fails gates (relative APK path, Packages menu, no absolute .apk).
- Built-in fixtures + scripts/aib-agent-trace-selftest.mjs (pnpm test:agent-trace).
- Inspired by Tracely patterns, fully on-device (AsyncStorage, no cloud stack).

## 1.6.88 — Termux ON ≠ every message is agent

- Agent runs only when intent needs disk/build/install/file ops or strong create-app.
- isChatOnlyMessage: capability lists, explanations, «что умеешь» → plain chat, no Termux commands.
- «Напиши полный список что умеешь» no longer starts assemble / build indicator.
- Hello World still routes to create-app agent when Termux is on.

## 1.6.87 — APK build audit: real scaffold + verified APK

- Deterministic create-app: valid AGP 8.2 buildscript, local.properties (sdk.dir), proper GradleWrapperMain gradlew.
- No Java lambdas in MainActivity; verify APK with test -f after assembleDebug; emit AIB_DETERMINISTIC_APK=absolute path.
- Toolchain: require aapt2; retry sdkmanager build-tools; reinstall gradle if version probe empty.
- Assemble wrap: auto-copy gradle-wrapper.jar from cache before failing NO_WRAPPER_JAR.
- Keep: strict TERMUX_DONE only with absolute .apk; file_ops for move/copy without rebuild.

## 1.6.86 — No fake APK success; move = file ops not rebuild

- TERMUX_DONE for build tasks requires absolute path to a real .apk file (not «проверьте app/build/outputs/apk/»).
- Move/copy to Download classified as file_ops: find + cp/mv only, no gradle/toolchain.
- isApkOrAppBuildTask excludes pure move/copy messages.

## 1.6.85 — Custom «Проверить ключ» without Model ID

- Check key: only Base URL + API key required; loads model list and auto-selects first chat model.
- Optional /chat/completions probe runs after models if Model ID is known; no blocking «Model ID обязателен».
- Same dialog for Custom slots 1 and 2.

## 1.6.84 — Raise floating status FAB above chat actions

- RuntimeStatusOverlay (pulse FAB): bottom 148 → 220 so it no longer covers message «Удалить» / thinking panel.

## 1.6.83 — Custom API key persist + agent self-install tools

- Fix: custom provider API key was lost on restart (setCustomProviderState typo → setCustomProvider1State).
- Persist custom slot 1/2 API keys on every change (SecureStore + AsyncStorage fallback).
- Agent: forbid TERMUX_DONE “open Packages menu / dependencies missing”; install via pkg/toolchain.ensure yourself.
- Reject premature DONE that only points user to Packages when building APK.

## 1.6.82 — UI indicators + info-query without agent

- Hide ReadinessBar / BuildProgress / AgentThinking when Termux console is open; show when closed.
- Fix AgentThinkingPanel bottom overflow (crooked indicator): tighter maxHeight, margins, scroll.
- isInfoOnlyQuery: questions about APK path / status skip Termux agent and answer from chat.
- detectTermuxIntent: pure path questions no longer force agent bridge.

# Changelog
## 1.6.81 — Create-app always finishes (no fake step-limit)

- Fixed isStrongCreateAppTask: JS \\b never matched Cyrillic «создай» → Hello World went to 28-step LLM death.
- Create-app: engine first + final engine on step budget (runCreateAppWithRetry) — never only «лимит шагов».
- Other long tasks: auto-extend step budget twice (+24 each) instead of hard stop.
- useLLM create-app maxSteps 96.

# Changelog
## 1.6.80 — Ordered workspace layout

- Fixed height Termux console (~34% screen, min 180) so output is always visible.
- Stack: Console → Progress → Chat (flex) → Thinking → Input — no overlap.
- BuildProgress + AgentThinking: compact/collapsed when terminal open.
- Chat FlatList always scrolls independently.

# Changelog
## 1.6.79 — Notify Close, settings collapsed, chat scroll

- Online/task sticky notifications: action «Закрыть» (dismiss only; offline keeps «Выгрузить из памяти»).
- Settings accordion sections all collapsed by default.
- Chat: FlatList always scrolls; progress/console/thinking no longer nest in a ScrollView that froze message scroll.

# Changelog
## 1.6.78 — Language on stages + final polish

- Pipeline stage labels follow options.language from useLLM.
- Scaffold MainActivity shows app name on screen.
- Full smart-agent checklist complete.

# Changelog
## 1.6.77 — Create-app retry + unified intent

- runCreateAppWithRetry: toolchain → scaffold → on fail auto-repair + second scaffold.
- ensureAndroidToolchain: pkg update, sdkmanager platforms;android-34 when possible.
- isCreateAppIntent in useLLM delegates to isStrongCreateAppTask (no stem drift).

# Changelog
## 1.6.76 — Finish remaining agent-engine gaps

- ensureAndroidToolchain: set +e (always reaches END), trustedInternal, soft java check.
- Deterministic scaffold: trustedInternal for long internal script.
- Create-app first updates full pipeline stages (plan→env→code→compile→apk→done).
- On scaffold fail: stages mark error, LLM gets repair context (no empty restart).

# Changelog
## 1.6.75 — Finish agent-engine integration

- toolchain.ensure AIB_TOOL registered.
- classifyBuildError maps to real recipes (gradle-pkg, nodejs, wget-curl).
- Create-app-first sets __createAppFirstTried; end-of-loop scaffold fallback skipped if first already ran.
- ensureAndroidToolchain: optional android-sdk pkg + preview license.
- useLLM logs create-app engine path.

# Changelog
## 1.6.74 — Agent engine: smarter than free-form bash

- **Create-app first**: ensureAndroidToolchain + deterministic Gradle scaffold before any LLM loop; returns APK immediately on success.
- **Tools-first protocol** in agent prompt (AIB_TOOL fs.create / build.run preferred over free bash).
- **Auto-repair** once on Gradle/SDK failures (java, wrapper, local.properties, aapt2, ndk, node_modules).
- **isCreateAppTask** uses strong stem matching (приложение, hello/хело world).
- New module `lib/agent-engine.ts` (scaffold, toolchain, classifyBuildError).

# Changelog
## 1.6.73 — Fix Adjacent JSX in index.tsx

- Removed extra </View> after input that closed the root early (UniversalAttachmentMenu / CameraCaptureModal).

# Changelog
## 1.6.72 — Notifications: unload button only for offline model

- categoryIdentifier / «Выгрузить из памяти» only when asSession (offline model in RAM).
- Online, Termux, agent, and result notifications have no action buttons.

# Changelog
## 1.6.71 — Second chat send + create-app cat writes

- handleSend no longer blocked by global isLoading (only isSessionAgentBusy).
- isSessionAgentBusy scoped to agent session; other chats can talk to the model.
- Multi-cat sanitizer skips file-write scripts (cat >, heredoc, tee) so create-app is not reduced to ls/head.
- isCreateAppIntent: Cyrillic stems (приложение) and hello/хело world match → 56-step pipeline + fallback.

# Changelog
## 1.6.70 — Scroll stack when terminal + indicators

- Terminal capped ~30% height; fills parent instead of fixed 40%.
- Chat + build steps + thinking wrap in ScrollView when terminal open so bottom panels are reachable above system nav.
- FlatList defers scrolling to parent while terminal is open; normal mode unchanged.
- Build steps list maxHeight 220.

# Changelog
## 1.6.69 — Settings section icons

- Accordion headers show Ionicons (phone, agent, models, voice, security, battery, UI, about).

# Changelog
## 1.6.68 — Fix termux-agent scaffold string syntax

- Rewrote buildDeterministicCreateAppScript with safe string parts (Metro Unexpected token at cat > \\"
).

# Changelog
## 1.6.67 — Fix settings.tsx Unterminated string

- Restored truncated autoPostReview en string and removed leftover fragment after SettingsGroup insert.

# Changelog
## 1.6.66 — Audit fix: runTermuxTask pipeline stages

- runTermuxTask path also initializes and advances full build step list.

# Changelog
## 1.6.65 — Upper build steps indicator

- Full pipeline list in BuildProgressPanel (create APK / source build).
- Statuses: done ✓, active spinner, pending ○, skipped — (visible but inactive).
- Stages advance from agent commands (code → env → gradle → apk → sign).
- Flutter/Expo steps skipped when not applicable.

# Changelog
## 1.6.64 — APK reliability audit

- Normalize Termux absolute paths (`/data/data/com.termux/files/usr` → `$PREFIX`) before security policy (fixes false deny on aapt2/SDK builds).
- Stronger CREATE_APP_PIPELINE: Gradle-first, $PREFIX-only paths, one script, no base64 chunks.
- Broader create-app intent (typos калькулятор/конкулятор, «сделай калькулятор»).
- Deterministic create-app fallback: if agent hits step limit without APK, scaffold minimal Gradle app + assembleDebug (trustedInternal).
- Allowlist: aapt/aapt2/d8/zipalign/apksigner (from prior).

# Changelog
## 1.6.63 — Settings accordion groups

- Settings screen reorganized into collapsible sections:
  Device, Agent settings, Offline model, Online models, Voice, Security, Background & battery, Interface, About.
- Tap section header to expand/collapse.

# Changelog
## 1.6.62 — Calculator build policy, chat chips, indicator gap

- SECURITY: `rm`/`mv` with ANDROID_HOME under `/data/data/com.termux` no longer denied as "other app" path (blocked real aapt2 builds).
- Allowlist: aapt/aapt2/d8/zipalign/apksigner/kotlinc/keytool.
- Create-app intent matches calculator typos (конкулятор/конкулятор).
- Main screen: horizontal chips to switch chats without drawer.
- Removed empty maxHeight wrapper that left a blank hole under ReadinessBar.

# Changelog
## 1.6.61 — Fix crash: isAgentRunningInOtherSession

- ReferenceError on launch: property was returned from useLLM but not destructured in ChatScreen.
- Destructure isAgentRunningInOtherSession / isSessionAgentBusy from context; canSend/canStop use isSessionAgentBusy.

# Changelog
## 1.6.60 — Parallel chat without killing Termux

- If Termux agent runs in chat A, chat B no longer asks to turn Termux OFF (that would abort A).
- Chat B automatically uses **model-only** replies; Termux stays ON for A.
- Amber banner explains this; send works in B without stopping A.

# Changelog
## 1.6.59 — Chat history, multi-session send, 2048 recovery fix

- Drawer: restored «История чатов» (was missing from custom menu).
- Sessions: send blocked only in the chat that owns the Termux agent; other chats stay usable (plain chat, or message if Termux busy elsewhere).
- Layout: when Termux console is open, progress panels get bottom safe padding + maxHeight so they are not under system nav.
- APK recovery: do not treat pipeline hint path `…/<Name>/app/build/outputs/…` as a real project (fixes 20min fake recovery loop on create 2048).
- gradle-wrapper missing: suggest copy from tool-pack cache instead of hard exit-only.

# Changelog
## 1.6.58 — Create small APK agent path (2048-style)

- Log analysis: paid model (mimo) spent all steps writing Game2048 via base64 chunks; never reached assembleDebug; step limit hit.
- CREATE_APP_PIPELINE: forbid base64 file chunks; one scaffold script + gradlew; minimal native template.
- Create-app maxSteps 40 → 56; intent also matches «apk + игра/2048/маленький».
- Same path used for “AI Builder builds itself” style small native APKs.

# Changelog
## 1.6.57 — Termux setup banner (not "crash") after reinstall

- Log banner: RUN_COMMAND / allow-external-apps after reinstall is **setup**, not crash.
  Title: «Нужна настройка Termux» (amber) with clear steps; «Почему упало» only for real build/agent failures.
- Startup probes (test -e journal/trace) no longer drive the red crash banner.
- SecurityException on RUN_COMMAND logged as **warn**, not error.
- summarizeFailure: clearer Termux permission wording.

# Changelog
## 1.6.56 — Readiness for Custom API + thinking timer mins + key persist

- ReadinessBar: Custom / OpenCode modes no longer look like «Offline (загрузить)». API ✓ uses the active custom key; mode chip (Custom/Online/OpenCode) always visible.
- RAM chip still shown for local/offline; dots reflect real provider readiness.
- «Думаю»: first 60s as seconds, then minutes (`3м 12с` / `3m 12s`).
- Custom API keys: SecureStore write with retry + AsyncStorage fallback; load via `readSecureStoreItem` so keys survive restart when SecureStore flakes.
- Compilation settings unchanged.

# Changelog
## 1.6.55 — Fix prepare shell parse (TERMUX_NO_OUTPUT exit=2)

- Root cause: shell `#` comments inside the one-line prepare script commented out the rest of the line (including `if/then`), producing bash parse error exit=2 with empty stdout.
- Removed all `#` comments from the prepare one-liner; SettingsManager patch uses `sed` (no python heredoc).
- Nested-quote for-loop in CACHE CHECK replaced with simple probes.
- Kept: pnpm store in `$HOME/.aibuilder-pnpm-store`, no-lockfile → npm, lock retry + npm fallback.
- Compilation settings of target projects unchanged.

# Changelog
## 1.6.54 — Fix pnpm store lock on Termux (orchat / Expo no-lockfile)

- Root cause for orchat prepare fail: `ERR_PNPM_STORE_DIR_ACQUIRE_OPERATION_LOCK` (pnpm store on shared FS).
- pnpm store forced to `$HOME/.aibuilder-pnpm-store` (Termux private storage).
- On lock/error: clear stale locks, retry once, then **fallback to npm install --legacy-peer-deps**.
- Works for Expo sources **without** pnpm-lock.yaml / package-lock.json (like OR Chat 1.0.0).
- Recovery hints: never invent native Android project when package.json+expo exist; fix PM → prebuild → gradlew.
- Compilation settings of target projects unchanged.

# Changelog
## 1.6.53 — AgentThinkingPanel auto-scroll to latest step

- «Думаю…» panel ScrollView now auto-scrolls to the newest step/command when history grows.
- onContentSizeChange + effect on items/activity keep the view pinned to the bottom while expanded.
- Compilation settings unchanged.

# Changelog
## 1.6.52 — Expo prepare: npm fallback + clear diagnostics

- After finding Expo root in directory SRC, no longer hard-fail if pnpm is missing.
- Tries: pnpm → corepack pnpm@9.15.0 → npm i -g pnpm@9.15.0 → **fallback to npm**.
- npm path: `npm ci` / `npm install --legacy-peer-deps` when no pnpm-lock.
- Always prints SEARCH_ROOTS, package.json candidates, EXPO_ROOT, lockfiles, package_manager to stdout (so logs show the real fail reason).
- Compilation settings unchanged.

# Changelog
## 1.6.51 — Fix Expo directory-source prepare (orchat / folder SRC)

- APK prepare: when SRC is a directory (not ZIP) without native gradle, Expo/RN discovery now searches `$SRC` first, then `$WORK/src`.
- Fixes false "no native gradle yet — check Expo/RN..." / NO_PROJECT on folder sources (e.g. `/storage/.../orchat`).
- Diagnostic dump on failure lists both SRC and WORK/src.
- Compilation settings unchanged.

# Changelog
## 1.6.50 — Smart auto params: phone RAM + model size

- recommendModelSettings rewritten: 0.5B / 1.5B / 3B / 7B+ get different n_ctx, threads, maxTokens, temp.
- 1.5B on ~6–8 GB phones → n_ctx 2048, threads 3, maxTokens ≤768, temp 0.25 (agent-stable).
- Boot no longer overwrites auto generation params with stale persisted values.
- Re-applies on GGUF import when «auto» is on.
- Compilation settings unchanged.

# Changelog
## 1.6.49 — Overlay default off + clearer status; BT-class audit

- Floating status overlay: **disabled by default**; enable in Settings.
- Overlay shows: model in RAM (yes/no), foreground task, context line (no vague «policy N»).
- Starts collapsed as small FAB when enabled.
- Template-literal ${BT} crash fixed in 1.6.48 (still included).
- Compilation settings unchanged.

# Changelog
## 1.6.48 — Fix Property BT crash on gradlew

- wrapAndroidAssembleCommand used JS template literals with ${BT}; Hermes threw Property BT.
- Setup shell uses single-quoted strings only.
- Compilation settings unchanged.

# Changelog
## 1.6.47 — Fix mirror-detect string concat (syntax/runtime)

- isPkgMirrorFailure / formatResultForModel: correct newline join (no over-escaped \\n).
- Removes accidental double semicolon in formatResultForModel.
- No compile-settings changes. Runtime UI same as 1.6.46.

# Changelog
## 1.6.46 — Runtime Environment UI simplified

- Main: status indicators Termux / proot / Linux (green/red).
- One primary button Install Linux or Check Linux.
- Complex UI under collapsible Advanced.
- Compilation settings unchanged.

# Changelog
## 1.6.45 — Fully automatic pkg mirror repair (no user)

- When Termux returns mirror:bad / Testing mirrors, the agent **itself**:
  1) writes Cloudflare packages-cf.termux.dev to sources.list
  2) runs pkg update
  3) if the failed command was pkg install/update — **retries it once**
- No need to open Termux or press UI buttons for this failure mode.
- isApkBuildTask expanded: «создай apk/игру/2048» recognized without zip path.
- Still includes premature DONE guard + soft AIB_TOOL parse.
- Compilation settings unchanged.

# Changelog
## 1.6.44 — Agent: mirror recovery + soft AIB_TOOL (1.5B garbage)

- softParseAgentTool: accept `build.run` and strip `, TERMUX_RUN:TERMUX_RESULT:0` junk from 1.5B models.
- AIB_TOOL_ERROR: clear JSON example; forbid mixing markers / inventing TERMUX_RESULT.
- formatResultForModel: if pkg mirror bad → HINT with Cloudflare sources.list fix + retry install.
- Fail strategies: same mirror recovery line.
- Still includes 1.6.43 premature TERMUX_DONE guard for APK tasks.
- Compilation settings unchanged.

# Changelog
## 1.6.43 — Reject premature TERMUX_DONE on APK tasks

- Agent: isPrematureApkDone — for create/build APK/game tasks, refuse TERMUX_DONE after only ls/pkg or system-prompt echo.
- Require absolute .apk path (or BUILD SUCCESSFUL + apk) before accepting DONE.
- [APK_BUILD_RULES] injected into agent task prompt.
- Stronger rejection of pasted mode A/B system text as final answer.
- Compilation settings unchanged.

# Changelog
## 1.6.42 — Softer accent + honest package status

- Theme: accent buttons darkened (#2DD4BF -> #0D9488) across theme + hardcoded UI.
- Packages menu: after install/cancel always re-check in Termux (not only install exit).
- Interrupted install remembered; after app restart package shows checking then real Termux status.
- Remove-cancel no longer forces badge OK with text Otmeneno.
- Compilation settings unchanged.

# Changelog
## 1.6.41 — Linux (Debian) step-by-step wizard

- Runtime: replaced confusing Bootstrap + Linux cards with one guided flow:
  0) allow-external-apps  1) fix Termux mirrors (Testing the available mirrors)
  2) install proot-distro  3) install Debian  4) auto pipeline  5) verify
- Each step has plain-language description + action button.
- Mirror fix writes Cloudflare Termux sources and runs `pkg update`.
- proot install detects mirror hang and tells user to press step 1.
- Export/import Debian kept under «Extra».
- Compilation settings unchanged.

# Changelog
## 1.6.40 — Log Device section + proot-distro install diagnostics

- Fixed missing `getDeviceProfile()` (log always showed `undefined is not a function` under === Device ===).
- useLogger: safe reads of expo-device fields (no throw if property is a function).
- Bootstrap `proot-distro` stage: `set -o pipefail`, `pkg update` before install, real exit code, clear message when Termux mirrors fail (termux-change-repo).
- tools-base install: same pipefail so pkg errors are not masked by `tail`.
- Compilation settings unchanged.

# Changelog
## 1.6.39 — Runtime labels, RAM chip, notification unload, settings cleanup

- Runtime: fixed literal `[language][language]` on project action hints (double index regression).
- Runtime: help text for advanced fleet/release button cluster.
- ReadinessBar: clear RAM chip (loaded / pinned / empty) next to API·Offline·Termux status.
- Status overlay raised to `bottom: 148` above composer.
- Settings: single «Configure background survival» button (removed duplicate App details).
- Settings: LAN / plugin safe mode buttons show current ON/OFF state.
- Notifications: unload action opens app to foreground; cold-start `getLastNotificationResponseAsync` so unload works when process was killed.
- termux-agent: soft-parse `AIB_TOOL: build.run` for small local models (less JSON parse loops).
- Compilation settings unchanged.

# Changelog
## 1.6.38 — Runtime i18n crash + status overlay UX

- `app/runtime.tsx`: project action hints had `{{ ru,uk,en }}` without `[language]` → React "Objects are not valid as a React child"; fixed 7 strings; hardened recovery title fallback.
- `RuntimeStatusOverlay`: raised above composer (`bottom: 118`), larger card, ordered rows (model / tasks / policy / ctx); collapse FAB same height.
- Settings → Interface: toggle to hide floating status card (AsyncStorage).
- Compilation settings unchanged.

# Changelog
## 1.6.37 — Fix withEnsureBuildConfig stripping ';' from Java package

- Root cause of repeated CBE failure on AibAccelNative.java: `withEnsureBuildConfig` walked all `.kt|.java` and rewrote package as Kotlin-style `package x` (no semicolon), breaking javac.
- Now: `.java` → `package com.sakana.aibuilder;` ; `.kt` → `package com.sakana.aibuilder`.
- withAibNativeAccel bulletproof generator kept as second line of defense.
- Compilation settings unchanged.

# Changelog
## 1.6.36 — Bulletproof AibAccelNative.java generation (javac package;)

- `plugins/withAibNativeAccel.js`: jniHelperJava uses string concat (not fragile template) so first line is always `package com.sakana.aibuilder;`.
- Pre-write delete of stale AibAccelNative.java; post-generate regex assert on `package …;`.
- Remove legacy path `com/aibuilder/accel/AibAccelNative.java` if present (old plugin).
- Root cause of CBE v54 fail: generated .java contained Kotlin-style `package x` without semicolon.
- Compilation settings unchanged.

# Changelog
## 1.6.35 — LeanCTX-inspired context engine (local)

- `lib/context-engine.ts`: multi-mode reads (full/signatures/map/density/lines/auto), content-addressed cache, reversible CTX_HANDLE expand, shell output compression (gradle/git/pnpm/adb), task compose, session metrics.
- `fs.read`: mode= argument; shapes via context-engine; large payloads → handle.
- New agent tools: `ctx.compose`, `ctx.expand`, `ctx.metrics`.
- `scripts/aib-hashline.mjs`: `read-mode` (signatures/map/density) for on-device shaping.
- `termux-executor`: best-effort compress large stdout via context-engine.
- `RuntimeStatusOverlay`: live context budget line (reads/hits/tokens saved).
- Compilation settings unchanged.

# Changelog
## 1.6.34 — Fix AibAccelNative.java package / JNI mismatch (release compile)

- `plugins/withAibNativeAccel.js`: generate `AibAccelNative.java` under app package (`com.sakana.aibuilder`) with correct `package …;` and dynamic `Class.forName`.
- `native/aib-native-accel/src/aib_accel_jni.c`: JNI export names updated to `Java_com_sakana_aibuilder_AibAccelNative_*` so optional libaibaccel.so matches.
- Root cause of CBE failure: generated Java had wrong package line (`package com.sakana.aibuilder` without `;` / wrong content under `com/aibuilder/accel/`).
- Compilation settings unchanged.

# Changelog
## 1.6.33 — Fix release bundle: unquoted `#fff` in runtime.tsx

- `app/runtime.tsx`: `{ color: #fff }` → `{ color: "#fff" }` (Metro SyntaxError: private names).
- Scanned all app/components TSX for unquoted `#hex` style values — clean.
- Settings guide: security policy + agent presets sections.
- Compilation settings unchanged.

# Changelog
## 1.6.32 — Seven DSHA-inspired capabilities (AI Builder native)

1. **Security policy** — `lib/security-policy.ts` + `docs/SECURITY_POLICY.md`; wired into termux-executor + shizuku.
2. **Backup vs secrets** — `lib/backup-secrets-policy.ts` + Settings note.
3. **Terminal tabs** — drafts/history per tab in Termux console UI.
4. **Agent presets** — coder / careful / apk_build / readonly / balanced.
5. **Mini-plugins + safe mode** — `lib/aib-plugins.ts` builtin skills.
6. **Status overlay** — floating compact card (model pin / tasks / policy).
7. **LAN status opt-in** — snapshot + token config (no open server by default).

Compilation settings unchanged.

# Changelog
## 1.6.31 — Audit: i18n hints, device notes, runtime copy

- Fixed `settingsGuideHint` (uk/ru/en were all English after a bad replace).
- Device notes no longer assume “4B only”; mention GGUF-aware auto.
- Runtime final validation message localized (ru/uk/en).
- `foreground-task`: ensure persistentLogger import.
- Compilation settings unchanged.

# Changelog
## 1.6.30 — About + Settings guide rewrite

- `lib/about-content.ts`: first-run steps, models, Termux, Runtime, safety, menu map (ru/uk/en).
- `lib/settings-guide.ts`: 18 sections — start, providers, offline auto params, agent, Termux, Shizuku, Runtime, battery, log, checklist.
- i18n: settingsGuideHint, aboutHeroSub; Custom #2 titles without DeepSeek.
- Compilation settings unchanged.

# Changelog
## 1.6.29 — Runtime UI layout: readable actions + hints + icons

- Container pipeline: vertical full-width buttons (no mid-word wrap), icons + short hints.
- Recovery: localized titles/hints + icons (was English-only registry text).
- Project card: session/Ubuntu/terminal/agent/Kali/proot/rootfs with descriptions.
- Styles: `actionFull`, `actionInner`, `actionHint` / `actionHintMuted`.
- Compilation settings unchanged.

# Changelog
## 1.6.28 — Auto model params from device + GGUF

- `analyzeGgufModel` + enhanced `recommendModelSettings(profile, model)`:
  n_ctx / threads / gen (temperature, maxTokens, topP) from RAM + weight size + quant + ~paramsB.
- `localModelEngine.getOnDiskModelInfo()` for on-disk GGUF facts.
- Auto applies on: boot (if Auto), download, import, «Сбросить на авто», and right before load into memory.
- UI: «Авто (телефон + модель)»; paramsHint updated.
- Logs: `auto model params: …` in main log.
- Compilation settings unchanged.

# Changelog
## 1.6.27 — Offline model pin + Custom #2 cleanup + tool logs

1. **Offline model keep-alive**
   - Notification action: **«Выгрузить из памяти»** (was «Закрыть»).
   - Unload runs only when session sticky was active (explicit user action).
   - Logs: pin on load, unload via notification/settings.
2. **Custom #2**
   - Title: «Кастомный №2» (no DeepSeek).
   - Empty defaults like Custom #1 (no api.deepseek.com / deepseek-chat preset).
3. **Main log**
   - Shizuku, Profile, Foreground tasks, Repair, Health export, Supervisor, NativeAccel → `persistentLogger`.
4. Compilation settings unchanged.

# Changelog
## 1.6.26 — Audit: i18n, FG clamp, agent health, copy polish

- Runtime: debian/bootstrap/import messages localized (ru/uk/en); quarantine label fixed.
- Failure journal EN: “unrepaired” (not “not yet repaired”).
- `foreground-task`: progress clamped to [0,1].
- `native-accel-loader`: simplified Promise API for isAvailable/probe.
- Script agent: mark health failed on abort.
- runtime-i18n: watchdog/userspace/health hints + UK «Канарейка».
- Shizuku/survival copy tightened.
- Compilation settings unchanged.

# Changelog
## 1.6.25 — Open MIT AibNativeAccel module (plan G delivered)

- `plugins/withAibNativeAccel.js` — injects `NativeModules.AibNativeAccel` (Kotlin path-map + optional JNI).
- `native/aib-native-accel/` — MIT C/JNI sources (`aib_map_path`, `libaibaccel`).
- Loader + RuntimeStatus probe linked module; backend priority 5 activates when present.
- app.config registers plugin. **No** gradle.properties / NDK / compileSdk changes.
- Selftest: aib-native-accel-module-selftest.mjs.
- Identity + guard → 1.6.25.

# Changelog
## 1.6.24 — Selftest hygiene (closeout)

- `aib-compilation-settings-guard-selftest`: reads hashes from guard module (no stale 1.6.7 pins); syncs version with package.json + identity.
- `aib-health-catalog-selftest` / phase25: accept current 1.6.x.
- Plan in-repo remaining: **0**.
- Identity + guard → 1.6.24. Compilation settings unchanged.

# Changelog
## 1.6.23 — Shizuku/rish bridge + native accel loader closeout

- **lib/shizuku-bridge.ts**: probe (package+rish), `shizukuExec`, `shizukuSelfCheck`.
- DevicePrivilegeDetection + LiveProbes + PrivilegeProvider rebind use bridge.
- RuntimeFacade.`shizukuSelfCheck` / `shizukuExec`; UI **Test Shizuku/rish**.
- **native-accel-loader.ts**: optional `NativeModules.AibNativeAccel`; NativeAccelBackend probes/exec via module.
- docs/NATIVE_ACCEL_SLOT.md — external MIT/Apache contract.
- Identity + guard → 1.6.23. Compilation settings unchanged.

# Changelog
## 1.6.22 — Privilege refresh + accel status UI

- Runtime status: **Refresh privileges** (Shizuku/root/adb live rebind).
- Userspace probe snap shows `accel=…` for `aib-native-accel` slot.
- NativeAccelBackend detail clarifies MIT/Apache .so requirement.
- Selftest: aib-privilege-accel-ui-selftest.mjs.
- Identity + guard → 1.6.22. Compilation settings unchanged.

# Changelog
## 1.6.21 — P2 profile Download path + Shizuku hint

- Profile export default: `/storage/emulated/0/Download/AIBuilder-profile-*.tar.gz` (survives uninstall); fallback HOME/logs.
- Shizuku health warn includes install/start hint (moe.shizuku.manager + rish).
- Runtime UI note under profile buttons.
- Selftest: aib-p2-profile-shizuku-selftest.mjs.
- Identity + guard → 1.6.21. Compilation settings unchanged.

# Changelog
## 1.6.20 — Plan closeout polish

- `runAssembleDebugInner`: ProcessRegistry watch `assemble-debug-*` + health ok/failed + finally unregister.
- docs/plan-dsha-parity.md + HARDENING — Definition of Done closeout.
- Selftest: aib-plan-closeout-selftest.mjs.
- Identity + guard → 1.6.20. Compilation settings unchanged.

# Changelog
## 1.6.19 — Quarantine clear + agent health marks (plan A3)

- `RuntimeFacade.clearSupervisorQuarantine` + Runtime UI button.
- Script agent: `markAgentHealth` ok/failed (preflight/success/exhausted) for supervisor ticks.
- Selftest: aib-quarantine-agent-health-selftest.mjs.
- Identity + guard → 1.6.19. Compilation settings unchanged.

# Changelog
## 1.6.18 — Process health → supervisor tick (plan A2/A3)

- ProcessRegistry.`patchMetadata` for live health flags.
- `ensureTermuxBridgeWatch`: sets `metadata.health` ok|failed (supervisor only acts on failed).
- ADB UI: preload last serial via `loadLastAdbSerial`.
- Selftest: aib-process-health-watch-selftest.mjs.
- Identity + guard → 1.6.18. Compilation settings unchanged.

# Changelog
## 1.6.17 — Supervisor health rule + watched process UI (plan A3)

- Diagnostic `runtime.supervisor` (stopped/degraded/ok); Repair → `startSupervisor()`.
- RuntimeStatus processList includes `watchdog` flag; UI lists watched processes.
- `runAssembleDebug` failure → `notePossibleBuildKill` (A4 soft survival path).
- Selftest: aib-supervisor-health-ui-selftest.mjs.
- Identity + guard → 1.6.17. Compilation settings unchanged.

# Changelog
## 1.6.16 — Health export v2 + script-agent watchdog

- `exportHealthReport` **v2**: results + supervisor + processes + privileges + userspace + openFailures + bootstrap state.
- `runScriptWithAgentInner` registers/unregisters ProcessRegistry `script-agent-*` with watchdog=true.
- Selftest: cold start `_layout` still has **no** `ensureBackgroundSurvival`.
- Identity + guard → 1.6.16. Compilation settings unchanged.

# Changelog
## 1.6.15 — Agent/profile FG + plan closeout note

- `runScriptWithAgent` → `withForegroundTask("agent")` for long recovery/build scripts.
- Profile export/import UI → FG `backup` / `restore`.
- docs/plan-dsha-parity.md status → 1.6.15 operational closeout.
- Selftest: aib-fg-agent-profile-selftest.mjs.
- Identity + guard → 1.6.15. Compilation settings unchanged.

# Changelog
## 1.6.14 — FG build/backup + termux-session watch (plan A1/A2)

- `runAssembleDebug` → `withForegroundTask("build")` (sticky notify during APK assemble).
- Runtime backup create/restore → FG kinds `backup` / `restore`.
- `ensureTermuxBridgeWatch` — ProcessRegistry entry from Health `runtime.termux-session`.
- Selftest: aib-fg-backup-build-selftest.mjs.
- Identity + guard → 1.6.14. Compilation settings unchanged.

# Changelog
## 1.6.13 — Supervisor watchdog wiring (plan A3)

- ProcessRegistry: agent / terminal / session / containers register `metadata.watchdog: "true"`.
- RuntimeSupervisor onFailure → FailureJournal `WATCHDOG_HEALTH_FAILED` + unregister.
- Runtime screen: soft `startSupervisor()` on mount (not battery settings).
- Selftest: aib-supervisor-watchdog-selftest.mjs.
- Identity + guard → 1.6.13. Compilation settings unchanged.

# Changelog
## 1.6.12 — Shizuku bridge harden + repair catalog 15 (plan P2/B)

- ShizukuProvider: optional `execElevated` (rish when present).
- DevicePrivilegeDetection: pm path + rish fallback.
- RuntimeFacade.refreshPrivileges rebinds live Shizuku/Root providers.
- scripts/repair: **15** allowlisted (.sh) — added wget-curl, gradle-wrapper, local-properties.
- docs/HARDENING_1_4_x.md + AIB_USERSPACE_RUNTIME.md — 1.6.x closeout / native accel note.
- Selftest: aib-shizuku-repair-catalog-selftest.mjs.
- Identity + guard → 1.6.12. Compilation settings unchanged.

# Changelog
## 1.6.11 — Phase G stub + Shizuku rule + profile transfer (plan)

- **G:** `BackendId aib-native-accel` + `NativeAccelBackend` (priority 5, probe unavailable until open .so); registered in `AibUserspaceRuntime` (router fallback).
- **P2 privilege:** diagnostic `privilege.shizuku` + `probeShizuku`.
- **P2 data:** `lib/profile-transfer.ts` export/import tar.gz; `RuntimeFacade.exportProfile` / `importProfile`; Runtime UI buttons.
- Selftest: `scripts/aib-phase-g-profile-selftest.mjs`.
- Identity + guard → 1.6.11. Compilation settings unchanged.

# Changelog
## 1.6.10 — A4 soft survival + bootstrap notify (plan)

- **A4:** `notePossibleBuildKill` / `maybeSurvivalReminder` — после ≥2 kill мягкий текст в UI; **без** auto-open battery settings.
- Device loop `build_failed` → note kill + optional reminder.
- **C3:** `notifyBootstrapProgress` + bootstrap обёрнут в `withForegroundTask("bootstrap")`.
- Selftest: `scripts/aib-a4-survival-bootstrap-selftest.mjs`.
- Identity + guard → 1.6.10. Compilation settings unchanged.

# Changelog
## 1.6.9 — JSX fix + Health export (plan B4)

- **Fix:** `app/runtime.tsx` — extra `</View>` after Backup card broke ScrollView (Metro: Expected corresponding JSX closing tag for <ScrollView>).
- **B4:** `RuntimeFacade.exportHealthReport()` → `home.logs/health-*.json`.
- Runtime Health UI: **Export** button next to Run / Repair all.
- Identity + guard baseline → 1.6.9 (package.json hash only). Compilation settings unchanged.

# Changelog
## 1.6.8 — Phase B expand (plan.md)

- Diagnostic rules: **runtime.home-layout**, **toolchain.ndk**, **toolchain.aapt2** + LiveProbes.
- DeterministicRepair recipes: home-layout, ndk-path, aapt2-sdk, adb-server.
- Allowlisted `scripts/repair/`: home-layout, ndk-path, aapt2-sdk, adb-server, disk-cleanup, termux-session (12 scripts total).
- repair-script-runner: SCRIPT_BY_RECIPE / DIAG_TO_RECIPE / AUTO_ALLOW extended.
- RuntimeFacade registers new health rules.
- Identity + compilation guard baseline → 1.6.8 (package.json hash only).
- Compilation settings (app.config, gradle, plugins, lockfile) **unchanged**.

# Changelog

## 1.6.7 — plan A3 + FG sticky + plan closeout

- **SupervisorPolicy** / RestartBudget / backoff; RuntimeSupervisor quarantine.
- Foreground tasks → **notifyLongTask** sticky notification.
- plan.md §9: phases A–F + H harness closed; G optional.

# Changelog

## 1.6.6

- Offline GGUF import: **parseGgufDisplayName** (e.g. qwen2.5-coder-0.5b → readable + Q3_K_M).
- Settings: load **active-model.json** from disk after restart; do not stick on catalog "Qwen2.5 3B".
- TERMUX_RUN: intercept **recipe ids** (gradle-pkg) → `runRepairRecipe` instead of shell exit 127.
- Agent hints: show exact `TERMUX_RUN:\npkg install …` lines.

# Changelog

## 1.6.5 — Phase F + H harness (plan.md)

- Agent repair hints: git/unzip/adb/proot + **collectHealthRepairHints**.
- Protocol abort appends localized Settings hint.
- **aib-acceptance-selftest.mjs** runs all selftests (Phase H checklist).

# Changelog

## 1.6.4 — Phase E (plan.md)

- **ADB pairing wizard**: pair (code) → connect (IP:port) → list devices.
- Humanized errors (unauthorized / offline / refused / missing adb).
- Last host persisted; Runtime Device card guide ru/uk/en.

# Changelog

## 1.6.3 — Phase D (plan.md)

- BackupManager.**list** + TermuxBackupAdapter.**listChildren**
- Runtime Backup UI: scope picker, create, **Verify**, restore, backup list refresh
- Facade `listBackups`

# Changelog

## 1.6.2 — Phase C (plan.md)

- **BootstrapPipeline**: stages termux-ready → tools-base → proot-distro → debian-image → workspace → verify.
- Resume via fingerprints; force re-run; reset stages.
- Default StageRunner (`lib/bootstrap-stage-runner.ts`) + facade `bootstrapRun` / UI card.

# Changelog

## 1.6.1 — Phase B (plan.md)

- Health rules: **git**, **unzip**, **debian** userspace image.
- DeterministicRepair: proot-distro, unzip, git, wget-curl recipes.
- `scripts/repair/*.sh` allowlisted helpers; SCRIPT_BY_RECIPE in runner.
- Expanded diagnostic → recipe map for one-tap repair.

# Changelog

## 1.6.0 — Phase A (plan.md)

- Health: **runtime.termux-session** + **runtime.disk** probes/rules.
- Foreground task kind `bootstrap`; Debian bootstrap/export tracked as FG tasks.
- Runtime UI: **Фоновые задачи** card with live ProgressBar.
- Selftest: `aib-phase-a-selftest.mjs`.

# Changelog

## 1.5.6

- Debian via proot-distro: **real stage progress** (ProgressBar), not a fake download spinner.
- **Export / import** Debian image (.tar.gz) manually from Runtime screen.
- Runtime Linux card: full copy, badges, export path fields, clearer bootstrap text.
- `lib/debian-distro.ts` + selftest.

# Changelog

## 1.5.5

- Failure journal: **per-item Repair** button (repairHealth by component id).
- Backup / Active project cards: icons + short help texts.

# Changelog

## 1.5.4

- **RuntimeHealth** receives FailureJournal → successful repairs mark failures repaired.
- Device bridge + Diagnostics cards: icons and short help texts.
- After «Repair all», open failure list refreshes.

# Changelog

## 1.5.3

- Runtime: **Failure journal** card (open unrepaired failures from Health/recovery).
- Facade: `listOpenFailures` / `listRecentFailures`.
- Agent `AGENT_PROTOCOL_ABORT` message includes Settings → switch model hint.

# Changelog

## 1.5.2

- Health checks write warn/error into **FailureJournal** for repair targeting.
- Script-runner toolchain recovery uses **DeterministicRepair-aligned** pkg installs (java/gradle/node).
- Health card: icon + short help (ru/uk/en).

# Changelog

## 1.5.1

- Runtime open: auto Linux probe + health + userspace + last boot failure.
- Button **pkg install proot-distro** when Linux unavailable.
- Last startup failure card on Runtime screen.

# Changelog

## 1.5.0

- Runtime screen UX: icons, help texts, status badges for supervisor / Linux / containers.
- Clear explanation: Linux = Debian userspace in Termux (proot), not a PC Linux.
- Auto-probe Linux status when opening Runtime screen.
- Free OpenCode models remain allowed (1.4.9); no paid-only hard block.

# Changelog

## 1.4.9

- **OpenCode free models unlocked** in AI Builder: removed hard-block that forced paid OpenCode Zen only.
- Settings no longer clear/migrate away `*-free` / `big-pickle` model ids.
- Soft hint that free or paid models from provider list are allowed.
- Self-test: `scripts/aib-opencode-free-model-selftest.mjs`.

# Changelog

## 1.4.8

- **StartupTrace** wired at AppLayout mount (begin → permissions → journal-recovery → markReady).
- **useRuntime**: runHealthChecks, repairHealth, initUserspace.
- Doc: `docs/HARDENING_1_4_x.md` (full 1.4.x map).
- Self-test: `scripts/aib-bootstrap-trace-selftest.mjs`.

# Changelog

## 1.4.7

- **repair-script-runner** — allowlisted Termux execution of DeterministicRepair recipes (low/medium, AIB_INTERNAL journal-recover).
- Health **Repair all** bridges to shell recipes via RuntimeFacade.repairHealth.
- Runtime i18n for Health / Userspace (ru/uk/en).
- StartupTrace API: lastStartupFailure / recordStartupStage on facade.
- Self-test: `scripts/aib-repair-runner-selftest.mjs`.

# Changelog

## 1.4.6

- **Agent × DeterministicRepair**: [ENV] MISSING/BROKEN lines inject fixed repair recipes into transcript (no invented shell).
- Runtime screen: **Userspace runtime** card (probe termux-native / proot-distro router).
- Self-test: `scripts/aib-agent-repair-hints-selftest.mjs`.

# Changelog

## 1.4.5

- **Agent protocol abort** after 5 consecutive invalid replies (stops free-model reasoning loops with clear AGENT_PROTOCOL_ABORT).
- `looksLikeProtocolViolation()` helper for chat/reasoning detection.
- **Settings → Background survival** (manual only; still never auto-opens on cold start).
- Journal **recoverPendingTransactions** on first RuntimeFacade init.
- Backup create tracks **foreground-task**.
- Self-test: `scripts/aib-agent-protocol-hardening-selftest.mjs`.

# Changelog

## 1.4.4

- **LiveProbes** — real Termux probes for Java/Gradle/Node/SDK/ADB/proot-distro.
- **RuntimeMaintenanceCoordinator** — ordered stop agent/terminals before exclusive mutate.
- **foreground-task** tracker for long work (build/inference/backup) + UI snapshot API.
- Runtime screen: **Health** panel (Run health / Repair all).
- Health rules wired to live probes in RuntimeFacade.
- useRuntime.restoreBackup aligned with RestoreTransaction API.

# Changelog

## 1.4.3

- **AibUserspaceRuntime** — open multi-backend userspace control plane (answer to proprietary proroot).
- **RuntimeBackendRouter** — priority/sticky/fastest policies, circuit-breaker failover, metrics snapshot.
- Backends: **termux-native** (fast path) + **proot-distro** (glibc rootfs); no closed binaries.
- Diagnostic rule `runtime.userspace`; facade APIs `initUserspaceRuntime` / `userspaceExec`.
- Doc: `docs/AIB_USERSPACE_RUNTIME.md` (native accelerator roadmap, license-safe).
- Self-test: `scripts/aib-userspace-runtime-selftest.mjs`.

# Changelog

## 1.4.2

- **RuntimeTransaction** — exclusive maintenance with prepare/mutate/verify/commit/rollback and drain timeout (stronger than DSHA RuntimeTasks barrier).
- **RuntimeJournal** — annotate(), pending recovery, rolled_back status; recovered on boot via `recoverPendingTransactions()`.
- **Backup format 2** + **RestoreTransaction** — inspect → pre-backup current → restore → verify → commit|rollback.
- **BackupIntegrity** — manifest validation, digest/fileCount checks, migration warnings.
- **DiagnosticRule + RepairManager** — typed check/repair registry (identity, journal, proot, adb, gradle/java/sdk/node recipes).
- **StartupTrace** — last 5 boots persisted; last failure queryable.
- **FailureJournal** — structured failure codes for repair targeting.
- **DeterministicRepair** — fixed recipes (gradle wrapper/cache, local.properties, jdk, adb, node); LLM never invents shell.
- RuntimeFacade wires transaction, startupTrace, failureJournal, deterministicRepair, health rules.
- Self-test: `scripts/aib-runtime-transaction-selftest.mjs`.
- Compilation guard baseline updated only for intentional package.json version bump.

## 1.4.1

- Fixed startup UX regression: background survival not auto-opened on cold start.
- Runtime identity 1.4.1; compilation guard baseline synced.

## 1.4.0

- Completed the v1.4 runtime hardening baseline.
- Linux/proot runtime, persistent AI workspace, device integration, One-Click App Factory.


## v158 (2026-09-27)
- extractProjectPath: file:// URI decode; reject content://
- prepare: if SRC missing, try Download↔Загрузки alternate
