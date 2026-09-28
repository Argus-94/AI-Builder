# Android Device Smoke Test

This is a real-device checklist, not a simulated success path.

## Preconditions

- `Termux On` and the native bridge are operational.
- ADB can see a physical device or emulator.
- The Android build toolchain is installed and verified.
- External-app execution is explicitly enabled only where required (`allow-external-apps`).

## Run

1. Build a debug APK.
2. Install the APK through the bounded device bridge.
3. Launch the detected package.
4. Capture screenshot and UI hierarchy.
5. Inspect logcat for fatal errors.
6. Recheck after any automatic repair.

## Expected evidence

The result must contain `AIBUILDER_OK` only after the real checks above pass. Never paste real API keys; examples such as `sk-...` are placeholders only.
