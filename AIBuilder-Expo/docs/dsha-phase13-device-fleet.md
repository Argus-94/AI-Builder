# DSHA Phase 13 — Device Fleet Manager

Phase 13 adds bounded multi-device Android rollout on top of the Phase 12 production deployment manager.

## Flow

`Release Channel -> Fleet Discovery -> Bounded Rollout -> Per-device Health Check -> Per-device Rollback -> Fleet State`

## Safety boundaries

- Only ADB device serials discovered from `adb devices` are eligible.
- Serial values are validated before being passed to ADB.
- Model output does not provide shell commands, APK paths, or device serials.
- Rollout concurrency is capped at 4 and defaults to 2.
- Health checks are bounded to 30 seconds.
- Each device keeps its own last healthy release in `artifacts/deployments/fleet-<channel>.json`.
- A failed device can roll back independently; healthy devices remain on the new release.

## Runtime UI

`AI: Fleet Rollout + Per-Device Rollback` starts a rollout for the selected release channel. The result reports healthy, failed, and rolled-back device counts.
