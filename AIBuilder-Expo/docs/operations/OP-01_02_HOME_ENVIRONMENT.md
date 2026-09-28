# Operation 1.2 — Canonical AIBuilderTermux HOME environment

## Goal

Connect the runtime architecture to a canonical `AI_BUILDER_HOME` / `HOME`
contract while keeping AI Builder compilation configuration untouched.

## Implementation

Added:

- `core/home/HomeEnvironment.ts`
- `core/home/HomeEnvironment.test.ts`

The resolver uses this priority:

1. explicit `AI_BUILDER_HOME`;
2. existing `HOME` only when it already points to `AIBuilderTermux`;
3. `/storage/emulated/0/AIBuilderTermux` as the runtime default.

The module returns a new environment object and does **not** mutate
`process.env` or any project configuration.

## Compilation protection

No Gradle, Expo, Android, package-manager, SDK, signing, or generated
`android/` configuration was changed.

## Result

`AIB_OPERATION_1_2_HOME_ENVIRONMENT_OK`
`AIB_AI_BUILDER_HOME_CANONICAL_OK`
`AIB_HOME_ENVIRONMENT_IMMUTABLE_INPUT_OK`
`AIB_UNRELATED_TERMUX_HOME_NOT_PROMOTED_OK`
`AIB_COMPILATION_SETTINGS_UNCHANGED_OK`
