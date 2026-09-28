# DSHA Phase 8 — AI Self-Healing QA

Phase 8 adds a bounded regression loop on top of the Phase 7 device test suite:

1. Generate a structured test suite from the user's natural-language QA goal.
2. Build the Android debug APK.
3. Install and execute the suite on the connected ADB device.
4. Store screenshots, accessibility XML and bounded logcat as evidence.
5. If tests fail, construct a repair prompt from the deterministic report and evidence references.
6. Run the existing Termux repair agent against the active project.
7. Rebuild the APK.
8. Rerun only the failed test cases.
9. Stop after a bounded number of build/repair attempts and emit the final report.

## Safety boundaries

- The model never directly controls ADB or an arbitrary shell through the QA planner.
- Test actions are a fixed allow-list: `launch`, `tap_selector`, `type_text`, `swipe`, `wait`.
- Assertions are evaluated locally from the accessibility tree.
- Test suites are capped at 8 cases and 12 steps per case.
- Device actions are capped per case and the runner has a case timeout.
- Evidence paths are generated inside the application evidence sandbox.
- Repair prompts explicitly instruct the repair agent not to change tests merely to obtain a pass.
- Subsequent iterations rerun only failed cases, preserving regression scope.

## Runtime

The Runtime panel now exposes **AI: Self-Healing QA**. The package name is optional because it can be detected from the APK. The result reports the number of passed cases, repaired case IDs, and the evidence root.
