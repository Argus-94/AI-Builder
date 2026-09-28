# Phase 33 — Real Android/Termux Device Integration

Phase 33 adds a fail-closed hardware integration harness on top of the existing
DeviceAgentBridge and Phase 32 agentic loop.

## What is exercised

- ADB/device availability through the configured device bridge.
- Physical/emulated screen size and UI hierarchy.
- Optional APK package detection and installation.
- Optional package launch and `pidof` verification.
- Real screenshot capture and logcat retrieval.
- No synthetic success path: missing/offline devices fail the integration.

## App/runtime API

`RuntimeFacade.runRealDeviceIntegration({ apkPath?, packageName?, launch?, screenshotPath? })`

The API is diagnostic/integration-only. It does not bypass Android permissions,
ADB authorization, Termux RUN_COMMAND security, or the existing agent policy.

## Host/Termux strict E2E

Use `pnpm test:real-env` first. Then run:

`node scripts/aib-android-e2e.mjs --apk /path/to/app-debug.apk --serial <serial>`

The E2E harness fails closed when no online device is present. `--allow-partial`
is diagnostic-only and must not be treated as a release pass.

## Current environment note

The source package can validate the integration contract without hardware. A
real build/install/launch/vision cycle is only a PASS when executed on a machine
with the Android SDK, Gradle dependencies, ADB, and an authorized Android
device/emulator available.
