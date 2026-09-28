# Runtime UI + Termux toolchain fix — 2026-09-25

## 1. Real Termux log issue fixed

The supplied 2048 build log showed a fragile model-generated toolchain probe. It chained several `command -v ... || pkg install ...` checks and produced only `gradle ok`, while the previous `gradle --version` probe had returned an empty channel. That did not provide enough evidence that the complete Android build toolchain was healthy.

The Termux agent now injects an app-authored environment snapshot with explicit states for Java, Gradle, Python, Node, Clang, SDK, AAPT2, zipalign and apksigner. Gradle is only reported as `OK` when an executable path exists and `gradle --version` produces non-empty output. Missing/broken tools are explicit, and the agent prompt forbids treating empty output as success or using long chained probes that hide individual failures.

The previously fixed protocol-marker regression remains enabled: prose that merely mentions `TERMUX_RUN:` / `TERMUX_DONE:` is not accepted as a machine command.

## 2. Runtime UI localization

The Runtime screen had many hardcoded English labels, including Linux Runtime, Container Manager, ADB, Fleet, Workspace, backup and App Factory controls. These are now localized for Ukrainian, Russian and English through `lib/runtime-i18n.ts`.

Long labels were intentionally shortened where needed for narrow Android screens. Technical identifiers such as `ADB`, `Logcat`, `rootfs`, `proot`, `Gradle`, `APK`, `Vision`, `SLO` and channel names remain unchanged because they are technical names rather than prose.

## 3. Theme key correction

The Runtime screen was still referencing obsolete `colors.bg` / `colors.inkMuted` keys even though the theme contract exposes `colors.background` / `colors.muted`. These references are now corrected.

## Verification

- `AIB_RUNTIME_I18N_AND_TOOLCHAIN_REGRESSION_OK`
- `AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK`
- `AIB_TERMUX_PROTOCOL_LOG_REGRESSION_SELFTEST_OK`
- `AIB_TYPE_SAFETY_SELFTEST_OK`
- `AIB_RUNTIME_E2E_CONTRACT_SELFTEST_OK`
- `AIB_RUNTIME_DSHA_SELFTEST_OK`
- `AIB_TOOLCHAIN_INTEGRITY_SELFTEST_OK`
