# AIBuilder Expo

**Source-only release:** `AIBuilder-Expo-v407`  
**Package:** `com.karat.aibuilder`  
**App version:** `1.10.12`

This archive contains application source and release checks. It does not contain a generated APK or AAB. Android build settings, EAS/Gradle configuration, package identity, and the app-version scheme are intentionally unchanged.

## Product areas

The app includes AI provider settings for **OpenRouter**, **OpenCode**, and **Custom provider** configuration; **Agent intelligence** and **Checkpoints**; device/runtime setup including **Shizuku**, **Termux:Boot**, and **Update Termux environment**; and project import/build workflows.

## Verification

Canonical package manager/lockfile: pnpm 9.15.0 (`pnpm-lock.yaml`).

Run `pnpm test:pre-release` from a dependency-installed checkout for the bounded source/recovery suite. It performs static checks and hermetic simulations; it is not a substitute for a physical Android device smoke test. See [`DEVICE_SMOKE.md`](DEVICE_SMOKE.md), [`AIBuilder_TEST_PLAN.md`](AIBuilder_TEST_PLAN.md), and [`CHANGELOG_V382.md`](CHANGELOG_V382.md).

## Logs and diagnostics

Build diagnostics may originate from the `app`, `termux`, `native`, `console`, `network`, or `agent` layers. Recovery reports the first root cause, and a claimed APK/AAB is accepted only after on-device file, archive-integrity, signature, and successful process-exit validation.

## v389 notes

Antigravity-inspired core: Native Priority (Fast Path), system rules, Desktop Mode prefs, runtime session isolation helpers, pkg bootstrap profiles. See `PLAN_ANTIGRAVITY_INSPIRED.md` and `CHANGELOG_V389.md`.
