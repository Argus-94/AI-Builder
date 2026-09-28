# AI Builder runtime reliability layer

This release ports the useful *architecture* of DSHA into AI Builder without copying proprietary binaries or replacing the existing Termux/Expo runtime.

## Implemented

- Runtime identity/version boundary (`core/runtime/RuntimeIdentity.ts`)
- Cooperative normal/maintenance task gate (`RuntimeTaskGate`)
- Durable runtime operation journal (`RuntimeJournal`)
- Runtime watchdog/supervisor (`RuntimeSupervisor`)
- Deterministic health checks + repair hooks (`RuntimeHealth`)
- Transactional backup/restore API with pre-restore rollback staging
- Real Termux `tar.gz` backup adapter with `tar -tzf` and `sha256sum` verification
- Scoped backups: full/projects/sessions/agent/toolchains
- Device automation capability boundary for ADB/Shizuku/native implementations
- Recovery execution history
- Runtime status exposes identity and supervisor state
- Runtime UI exposes watchdog and full backup/restore controls

## Deliberately not copied

- `proroot` binaries: third-party/proprietary licensing must be handled separately.
- DSHA UI/WebView architecture: AI Builder already has its own UI/runtime model.
- An always-on Android foreground service: the current AI Builder configuration explicitly avoids indefinite model-residency foreground services. `RuntimeSupervisor` is therefore a lifecycle/watchdog layer, not a claim that Android will keep the process alive after the OS kills it.

## Native device bridge contract

`core/device/DeviceAgentBridge.ts` is the stable boundary. A production native implementation can provide:

- shell
- screenshot
- APK install
- app launch
- logcat
- tap/swipe

Existing Termux and privilege providers remain the fallback implementation path. This keeps the core agent testable without a physical device.

## Restore safety

Restore runs under maintenance exclusivity. Before replacing data, the current scoped tree is archived into `.recovery/<timestamp>`. If restore fails, the previous tree is restored and the journal records `rolled_back`. An unfinished operation remains visible through health diagnostics rather than being silently discarded.
