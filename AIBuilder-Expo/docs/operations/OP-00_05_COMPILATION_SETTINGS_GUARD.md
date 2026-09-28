# Operation 0.5 — CompilationSettingsGuard

## Input

- Archive: `AIBuilder-Expo-v1_3_374-v4.zip`
- Source version: `1.3.374`
- Compilation baseline: `docs/operations/OP-00_04_HASH_MANIFEST.json`

## Implemented

Added a read-only source-tree guard:

- `lib/compilation-settings-guard.ts`
- `scripts/aib-compilation-settings-guard-selftest.mjs`

The guard protects 9 compilation-related source files using the SHA-256 values captured in operation 0.4:

1. `app.config.ts`
2. `gradle.properties`
3. `package.json`
4. `pnpm-lock.yaml`
5. `eas.json`
6. `plugins/withFixGradleProperties.js`
7. `plugins/withEnsureBuildConfig.js`
8. `plugins/withLlamaRnProguard.js`
9. `plugins/withTermuxBridge.js`

It also treats these generated Android paths as forbidden at this source-baseline stage:

- `android/`
- `android/local.properties`
- `android/gradle.properties`
- `android/gradle/wrapper/gradle-wrapper.properties`
- `android/app/build.gradle`

## Safety properties

- The guard is read-only.
- It does not write, delete, rename, copy, generate, repair, pin, or replace compilation files.
- A mismatch returns a failure result; it does not attempt an automatic fix.
- No `package.json`, lockfile, Gradle properties, wrapper, SDK setting, or app configuration was changed by this operation.
- No generated `android/` directory was introduced.

## Verification

```text
AIB_COMPILATION_SETTINGS_GUARD_OK
AIB_COMPILATION_SETTINGS_GUARD_FILES=9
AIB_COMPILATION_SETTINGS_UNCHANGED_OK
AIB_GENERATED_ANDROID_DIR_ABSENT_OK
AIB_GUARD_READONLY_IMPLEMENTATION_OK
```

The self-test additionally verifies the protected file hashes against the operation 0.4 baseline and checks that the guard implementation contains no filesystem mutation APIs.

## Build note

A full Android compilation was not rerun in operation 0.5. Operation 0.2 already recorded the environment blocker: the available `pnpm` was `0.32.0` while the project requires `pnpm@9.15.0`, and Corepack could not download the required version because of network DNS failure. This operation therefore uses the dedicated guard self-test and the immutable baseline as its validation gate.
