# DSHA Phase 14 — Fleet Canary & Progressive Rollout

Phase 14 adds bounded progressive rollout across connected Android devices.

Default stages:

1. 10% — zero failed devices allowed.
2. 25% — up to 20% failed devices allowed.
3. 100% — up to 20% failed devices allowed.

A failed stage stops the rollout. Each device still uses the Phase 13 per-device health check and auto-rollback. The model does not generate ADB commands, serials, paths, or shell fragments.

State is stored at `artifacts/deployments/canary-<channel>.json`.

The stage thresholds are configurable through the typed `stages` option and are clamped to safe percentage ranges. A final 100% stage is always appended when omitted.
