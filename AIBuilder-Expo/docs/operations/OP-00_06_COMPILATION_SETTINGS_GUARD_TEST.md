# Operation 0.6 — CompilationSettingsGuard test

## Input

- Archive: `AIBuilder-Expo-v1_3_374-v5.zip`
- Source version: `1.3.374`
- Guard: `lib/compilation-settings-guard.ts`
- Guard self-test: `scripts/aib-compilation-settings-guard-selftest.mjs`
- Baseline: `docs/operations/OP-00_04_HASH_MANIFEST.json`

## Test performed

The dedicated read-only guard self-test was executed with Node.js:

```text
node scripts/aib-compilation-settings-guard-selftest.mjs
```

The test verifies:

- guard version and baseline source version;
- presence of SHA-256 hashing/read APIs;
- absence of filesystem mutation APIs in the guard implementation;
- all 9 protected compilation-file hashes still match the baseline;
- all forbidden generated Android paths remain absent;
- every protected path/hash is present in the guard;
- `package.json` remains version `1.3.374`;
- `package.json` still declares `pnpm@9.15.0`.

## Result

```text
AIB_COMPILATION_SETTINGS_GUARD_OK
AIB_COMPILATION_SETTINGS_GUARD_FILES=9
AIB_COMPILATION_SETTINGS_UNCHANGED_OK
AIB_GENERATED_ANDROID_DIR_ABSENT_OK
```

Additional filesystem check:

```text
AIB_GENERATED_ANDROID_DIR_ABSENT_OK
```

No compilation setting was changed and no generated Android project was introduced.

## Build note

A full Android build is not repeated in this operation. The previously recorded environment blocker from operation 0.2 remains applicable: the available `pnpm` was `0.32.0`, the project requires `pnpm@9.15.0`, and Corepack could not download the required version because of DNS/network failure. This operation is therefore validated by the dedicated immutable-guard self-test and the baseline checks.
