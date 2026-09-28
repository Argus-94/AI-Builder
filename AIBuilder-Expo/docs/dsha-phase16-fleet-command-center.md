# DSHA Phase 16 — Fleet Command Center

Phase 16 adds a local command center over the Phase 13–15 fleet primitives.

## Capabilities

- Read-only fleet snapshot: ADB state, current/previous release, per-device status, rollout observability and incidents.
- Device-scoped `deploy` using the existing bounded fleet deployment path.
- Device-scoped `rollback` to the last known release recorded for that serial.
- Rollback health verification and state update.
- Incident visibility is derived from the existing observability store; the command center does not mutate incident severity.
- UI actions are constrained to `deploy` and `rollback`; the model cannot supply arbitrary ADB commands or serials.

## Storage

The command center reads and updates only the project-scoped `artifacts/deployments` state used by earlier phases.

## Safety boundaries

- Serial validation: `^[A-Za-z0-9._:-]{1,128}$`.
- Package validation uses Android application-id syntax.
- A rollback is allowed only when a previous artifact is recorded for the selected serial.
- Rollback package detection falls back to APK metadata when no package name is entered.
- No arbitrary shell text is accepted from model output.

## UI

Runtime exposes **AI: Fleet Command Center**. The panel shows device status, release version, failure rate and recent incidents, and provides per-device Deploy/Rollback actions.
