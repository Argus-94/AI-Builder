# Full deep audit — 2026-09-25

## Scope

Audited the complete AI Builder Expo project from the latest runtime/i18n/toolchain-fix archive, including UI routes/components, Runtime/Termux/agent paths, provider settings, persistence/migration, self-tests, package/lockfile guards, and source syntax.

## User-requested changes

- Left drawer labels are localized through the existing i18n layer.
- `Checkpoint` was replaced in user-facing Russian/Ukrainian UI with **Точки сохранения / Точки збереження**.
- `Script Runner` was shortened to **Сценарии / Сценарії / Scripts** so it fits the drawer.
- DeepSeek's dedicated settings card was replaced by two generic provider slots:
  - **Custom #1** — existing custom provider slot.
  - **Custom #2 · DeepSeek** — starts with `https://api.deepseek.com/v1` + `deepseek-chat` but is fully editable.
- Both custom slots can be selected with **Use for chat and agent** and are routed through the same active `custom` provider path used by the Termux agent.
- Legacy `deepseek` mode/settings are migrated to Custom #2 for existing installations.
- Custom #2 has its own SecureStore API-key slot and AsyncStorage configuration.

## Bugs / regressions found and fixed

1. **Stale UI self-tests** — multiple historical phase tests still searched for old English button literals after Runtime UI was localized. They were updated to verify the current `runtime-i18n` keys and UI wiring instead of requiring obsolete English text.
2. **Runtime hard-coded English buttons** — remaining Fleet Backup/SLO/Recovery/Android/Workspace/Memory action labels were localized. Busy labels for Fleet Command and Build/Vision/Fix were also moved into Runtime i18n.
3. **Checkpoint terminology leakage** — Russian/Ukrainian checkpoint messages still contained English `checkpoint`; user-facing strings now use localized terminology.
4. **Custom provider dialog localization** — `Chat endpoint path` and its helper text were hard-coded; both are now translated.
5. **Settings guide drift** — documentation still described DeepSeek as a dedicated settings dialog and listed the old Script Runner label. It now describes Custom #1/#2 and the current drawer wording.
6. **README drift** — provider and sidebar documentation was updated to match the current two-slot custom-provider design.
7. **Compilation-settings guard drift** — the protected `package.json` hash was updated after adding the new regression self-test command, and the guard baseline was kept synchronized.
8. **Phase 20 disaster-recovery self-test drift** — it required an obsolete English button literal; it now checks the localized Runtime key.
9. **Termux protocol regression self-test execution** — the test imported a `.ts` file directly and failed under plain Node. It now launches the TypeScript parser test through Node's type-stripping loader while remaining executable as a normal `.mjs` self-test.
10. **Autonomous/device-loop historical test drift** — the test was updated to the current localized Runtime key.

## Validation

- Full source syntax: **PASS** (`ts=315`, `js=112`, `json=5`, `sh=1`).
- Compilation settings guard: **PASS**.
- Complete self-test suite: **96/96 PASS** (the full-source syntax test was also run separately and passed).
- Custom provider slot regression: **PASS**.
- Runtime i18n/toolchain regression: **PASS**.
- Termux protocol log regression: **PASS**.
- Phase 7–25 historical regression contracts: **PASS** after updating obsolete UI assertions.
- Phase 26–36 contracts: **PASS**.

## Important environment limitation

A native Expo/Android build was not claimed as verified in this audit because the supplied archive does not contain `node_modules` and the audit environment has no pnpm dependency store. Source-level syntax, deterministic self-tests, contracts, persistence/migration paths, and security guards were exercised instead. A real Termux/Android APK build still requires running the project in the target Termux environment.
