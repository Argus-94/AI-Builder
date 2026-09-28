# AI Builder v1.4.1 — Startup Safety + DSHA Continuity Audit

Date: 2026-09-25

## Scope

Continuation of the DSHA-derived runtime hardening work (see shared ChatGPT analysis of https://github.com/DSH-APP/DSHA and prior v1.4.0 deep audits).

## Primary defect fixed

**Startup redirected to system Settings (battery / unrestricted data)**

`hooks/usePermissions.ts` automatically called `ensureBackgroundSurvival()` after the media/notification permission request. That helper opens `IGNORE_BATTERY_OPTIMIZATION_SETTINGS` (and fallback app-details) via intents. On some devices / ROMs this produced a visible bounce into Settings on every cold start (reported by user).

**Fix:** removed the import and the call. The helper `lib/background-survival.ts` is retained for explicit user-initiated action from Settings. A new self-test `scripts/aib-startup-safety-selftest.mjs` guards against re-introduction.

## Version

- `package.json` → 1.4.1
- `core/runtime/RuntimeIdentity.ts` appVersion → 1.4.1 (schema/rootfs/toolchain unchanged → no migration)
- Compilation-settings guard baseline updated **only** for the intentional `package.json` hash and `BASELINE_SOURCE_VERSION`. No other compilation configuration files were modified (per project rule).

## DSHA layers re-verified (no behavioural change required)

- RuntimeTaskGate (normal vs exclusive maintenance)
- RuntimeSupervisor + ProcessRegistry
- RuntimeJournal / RuntimeIdentity
- BackupManager + Termux/Memory adapters
- DeviceAgentBridge / DeviceAgentTools / TermuxAdbDeviceBridge
- RuntimeHealth registry

All existing `scripts/aib-*-selftest.mjs` continue to pass, including:

- AIB_COMPILATION_SETTINGS_GUARD_OK
- AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK
- AIB_STARTUP_SAFETY_SELFTEST_OK
- AIB_DEEP_AUDIT_SELFTEST_OK
- AIB_PHASE25_FINAL_HARDENING_SELFTEST_OK version=1.4.1

## Environment limitation

No physical Android/ADB/SDK end-to-end build was available in this audit environment. Static, contract and self-test coverage is complete; real-device PASS is not claimed.

## Residual notes

- proot remains a userspace isolation layer, not a hardened VM.
- Background survival should be exposed as an explicit Settings action in a future UI pass if not already present.
