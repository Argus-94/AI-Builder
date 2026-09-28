# DSHA Phase 6 — Accessibility/UI Tree and Test Engine

This phase adds a semantic Android test layer on top of the ADB/device loop.

## Capabilities

- `device.ui_hierarchy` — captures `uiautomator dump` XML.
- `AccessibilityTree` — parses XML into a platform-neutral node tree.
- semantic selectors: text, resource-id, class, content-description, package.
- bounds and node-center extraction.
- `device.detect_package` — detects an APK application id using `aapt`, `aapt2`, or `apkanalyzer` when available in the Termux environment.
- `device.screen_size` — reads Android display size.
- `DeviceTestPlan` — deterministic baseline test plan generator.
- `DeviceTestAssertions` — deterministic assertions over the UI tree.
- DeviceAutomationAgent now supplies the semantic tree and test plan to Vision and evaluates assertions after every action.

## Security model

Vision never receives arbitrary shell authority. The model can only propose bounded UI actions. Semantic assertions are evaluated locally by deterministic TypeScript code. Package detection is performed by the runtime toolchain, not by model inference.

## Automatic package detection

The APK package name is optional in `DeviceAppLoop` and autonomous device testing. If omitted, the runtime asks the Termux environment for `aapt`, `aapt2`, or `apkanalyzer` output and validates the resulting application id before launch.

## Test loop

`build -> install -> launch -> screenshot -> UI tree -> Vision -> action -> screenshot -> UI assertions -> logcat -> repair/rebuild`
