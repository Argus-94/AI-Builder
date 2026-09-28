# AI Builder Test Plan

## Runtime log sources

- `app` — application/UI/runtime errors.
- `termux` — Termux command execution and environment events.
- `native` — native Android bridge/service events.
- `console` — terminal/console output.
- `network` — provider/download/network events.
- `agent` — bounded AI agent activity.

## Release smoke

1. Run the source syntax self-test.
2. Run the runtime facade/e2e/DSHA contracts.
3. Verify Linux/proot/container policy tests.
4. Verify persistent workspace and project-memory tests.
5. Run Phase 33 real-device integration when ADB/device/toolchain are available.
6. Run the One-Click App Factory only after Linux, Node/pnpm, Java, Android SDK and Gradle readiness checks pass.

## Real Android smoke

The real-device test must not report success when no Android device/emulator is connected. A valid run requires ADB discovery, APK install, launch, PID/package verification, screenshot, UI hierarchy and logcat evidence.
