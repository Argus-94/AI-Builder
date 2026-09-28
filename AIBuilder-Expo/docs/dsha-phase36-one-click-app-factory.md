# DSHA Phase 36 — One-Click App Factory

## Purpose

Phase 36 turns the existing runtime layers into one bounded application factory:

`natural-language prompt -> project -> persistent workspace -> proot container -> scaffold -> LLM coding -> Android prebuild -> Gradle APK -> optional device QA -> final artifact`

## Security boundaries

- The LLM only proposes complete-file edits through `AICodingAgent`.
- Container commands remain restricted by `ProotContainerManager`.
- Project paths resolve below the canonical `HOME/projects` directory.
- Coding iterations and Android build attempts are capped.
- Device QA requires an explicit `VisionAnalyzer` and uses the existing device automation policy boundary.
- No API key is copied into the project, prompt, workspace, or generated files by this phase.

## Runtime API

`RuntimeFacade.runOneClickAppFactory(request)` returns a structured result with stage status, project path, container id, optional APK path, device result, history, and an error when the pipeline stops.

## Android stage

For Expo projects the factory runs:

1. `npx expo prebuild --non-interactive --no-install`
2. `./gradlew assembleDebug --no-daemon -x test`
3. bounded APK discovery under `/workspace/android`

The returned APK path is mapped back to the mounted host project path.

A missing Android/Expo/Gradle toolchain is reported as a failed stage; it is never treated as a successful APK build.

## Device QA

Device QA is optional. When enabled it requires both an APK and a `VisionAnalyzer`. The existing Agentic Build Loop is used for the bounded install/launch/screenshot/UI assertion/repair cycle.

## Validation

- `AIB_PHASE36_ONE_CLICK_APP_FACTORY_SELFTEST_OK`
- `AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK`
- `AIB_RUNTIME_FACADE_SELFTEST_OK version=1.4.0`
- `AIB_RUNTIME_E2E_CONTRACT_SELFTEST_OK version=1.4.0`
- `AIB_RUNTIME_DSHA_SELFTEST_OK version=1.4.0`
- Phase 33/34/35 self-tests remain green.
