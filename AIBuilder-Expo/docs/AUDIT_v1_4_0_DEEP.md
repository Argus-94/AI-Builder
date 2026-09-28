# AI Builder v1.4.0 — Deep Audit / Remediation Report

## Audit scope

Full source tree through Phase 36, including RuntimeFacade, Linux/proot runtime, persistent workspace, project generator, coding agent, LLM coding brain, agentic build loop, One-Click App Factory, Android build path, device automation integration, package/lockfile guards, and all repository self-test scripts.

## Remediations applied in this audit

1. One-Click Android build no longer depends on a Java/Android SDK inside the Debian proot container. Expo prebuild remains in the container, while the verified existing Termux Android build engine performs the real Gradle/APK/signing step on the host.
2. One-Click Device QA no longer routes through the generic host rebuild loop. It tests the already-built APK and, after a failed device check, repairs through the container coding agent and rebuilds through the verified host Android build engine.
3. One-Click now bootstraps missing Debian userland prerequisites (`nodejs`, `npm`, `python3`, `git`, certificates and pnpm where needed) before generation/build workflows.
4. Runtime container creation validates project IDs before constructing host mount paths.
5. Public proot command allowlist no longer exposes `sh`/`bash` as direct commands, preventing an obvious `sh -c` command-string escape from the allowlist.
6. Project generator and coding agent reject edits to `.git`, AI Builder state directories, `.env*`, local.properties, and common private-key/credential paths.
7. LLM workspace collection excludes `.git`, snapshots, memory, environment files, credentials and key material and redacts common secret formats before provider submission.
8. Persistent project memory normalizes and redacts loaded historical entries before they become LLM context.
9. Persistent workspace secure `.gitignore` rules now include AI Builder state and common secret/config files.
10. Snapshot restore preserves `.aib-snapshots/` instead of deleting the snapshot history during `git clean`.
11. Removed an unnecessary first empty Python write from project generation.
12. Public `core/index.ts` now exports the Phase 26–36 runtime/workspace APIs.
13. Added explicit Phase 36 and deep-audit self-test scripts to `package.json`.
14. Updated the compilation-settings guard baseline for the intentional `package.json` test-script additions.

## Automated verification

All `scripts/aib-*selftest.mjs` scripts pass in the available environment: **0 failures**.

Key checks:

- `AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK ts=314 js=108 json=5 sh=1`
- `AIB_DEEP_AUDIT_SELFTEST_OK checks=21`
- `AIB_PHASE36_ONE_CLICK_APP_FACTORY_SELFTEST_OK`
- `AIB_PHASE35_PROJECT_MEMORY_SELFTEST_OK`
- `AIB_PHASE34_PERSISTENT_WORKSPACE_SELFTEST_OK`
- `AIB_PHASE33_REAL_DEVICE_INTEGRATION_SELFTEST_OK`
- `AIB_PHASE32_AGENTIC_BUILD_LOOP_SELFTEST_OK`
- `AIB_PHASE31_LLM_CODING_BRAIN_SELFTEST_OK`
- `AIB_PHASE30_AI_CODING_AGENT_SELFTEST_OK`
- `AIB_PHASE29_PROJECT_GENERATOR_SELFTEST_OK`
- `AIB_PHASE28_WORKSPACE_BUILDER_SELFTEST_OK`
- `AIB_PHASE27_CONTAINER_MANAGER_SELFTEST_OK`
- `AIB_PHASE26_LINUX_RUNTIME_SELFTEST_OK`
- `AIB_COMPILATION_SETTINGS_GUARD_OK`
- `AIB_P2_TYPE_SAFETY_SELFTEST_OK`
- `AIB_SHELL_BOUNDARY_SELFTEST_OK`
- `AIB_ARCHIVE_BOUNDARY_SELFTEST_OK`
- `AIB_LOCKFILE_SELFTEST_OK`
- `AIB_TOOLCHAIN_INTEGRITY_SELFTEST_OK`
- `AIB_ADDON_INTEGRITY_SELFTEST_OK`
- `AIB_MODEL_INTEGRITY_SELFTEST_OK`
- `AIB_GRADLE_WRAPPER_INTEGRITY_SELFTEST_OK`
- `AIB_DOCS_SELFTEST_OK`

## Environment-limited checks

A real Android/ADB build cannot be marked PASS in this audit environment because the environment does not contain `adb`, `sdkmanager`, `ANDROID_SDK_ROOT/HOME`, generated `android/`, or installed project `node_modules`. The real-environment checker reports `AIB_REAL_ENV_NOT_READY` and the Android E2E script reports that `adb` is unavailable. No false hardware PASS is claimed.

A full dependency-backed TypeScript compilation was also not claimed because the uploaded source archive intentionally has no `node_modules`. The repository's dedicated source syntax scan passes, while a raw standalone `tsc` invocation without Expo/React/Node/Axios type dependencies naturally reports missing external modules/types.

## Remaining architectural boundary

The proot container is an execution-isolation mechanism for the workflow, not a kernel-level security boundary. Host Android SDK/build/signing operations intentionally remain behind the existing guarded Termux build engine. The LLM itself does not receive arbitrary shell access and edits remain bounded by the coding-agent path/size/count policy.
