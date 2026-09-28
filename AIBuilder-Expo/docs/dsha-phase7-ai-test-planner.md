# DSHA Phase 7 — AI Test Planner + Evidence + Suite Runner

Phase 7 adds a bounded end-to-end Android QA layer on top of the Phase 6 accessibility tree.

## Flow

1. A natural-language test specification is converted into a structured suite.
2. The planner accepts an optional model callback, but always validates the JSON locally and falls back to a deterministic planner.
3. Each case installs the APK, launches it, executes only allow-listed actions, and evaluates assertions locally.
4. Before/after screenshots, UI hierarchy XML and bounded logcat are stored as evidence.
5. A JSON and Markdown report is generated with per-case status and evidence references.
6. The Runtime screen exposes **AI: Generate & Run Test Suite**.

## Allowed actions

- `launch`
- `tap_selector`
- `type_text`
- `swipe`
- `wait`

The planner cannot emit arbitrary shell commands or arbitrary filesystem paths. Selector actions resolve against the Android accessibility tree; coordinates are used only for bounded swipe actions.

## Safety / determinism

- Maximum 8 test cases and 12 steps per case.
- Local assertion evaluation is authoritative; model text cannot mark a test as passed.
- Package names are detected from the APK when omitted.
- Input text is length-limited before reaching `adb shell input text`.
- Evidence is written into the app-scoped AI Builder evidence directory.
- Install/launch/action failures are reported as failed or blocked; they are never treated as success.

## Example specification

`Проверь вход, регистрацию, выход и ошибочный пароль. Для каждого сценария сохрани скриншот, UI tree и logcat.`

The deterministic fallback recognizes common login/registration/logout/wrong-password phrases and creates separate bounded cases. A connected model can produce richer selectors and assertions using the same schema.
