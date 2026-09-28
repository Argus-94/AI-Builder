# Operation 1.3 — HomeInitializer

## Goal

Add a runtime-only initializer for the canonical AIBuilderTermux HOME tree.

## Implementation

Added:

- `core/home/HomeInitializer.ts`
- `core/home/HomeInitializer.test.ts`

`HomeInitializer` receives a `HomeLayout` and an injected `HomeDirectoryAdapter`.
The adapter owns actual storage operations. This avoids assuming that the React
Native JS runtime can directly write to Android shared storage.

Directory creation order is deterministic and parent-first:

1. HOME root
2. projects
3. workspace
4. containers
5. containers/ubuntu
6. containers/kali
7. toolchains
8. sdk
9. cache
10. logs
11. backups
12. .ai-builder/metadata

The initializer is idempotence-oriented: the adapter contract explicitly allows
existing directories.

## Compilation protection

No Android, Gradle, Expo, SDK, Java/Kotlin, package manager, or build settings
were changed.
No generated `android/` directory was introduced.

## Self-test markers

- `AIB_OPERATION_1_3_HOME_INITIALIZER_OK`
- `AIB_HOME_INITIALIZER_PARENT_FIRST_OK`
- `AIB_HOME_INITIALIZER_CANONICAL_TREE_ONLY_OK`
- `AIB_HOME_INITIALIZER_STORAGE_INJECTED_OK`
- `AIB_COMPILATION_SETTINGS_UNCHANGED_OK`
