# OP-01.1 — HomeLayout

## Input
AIBuilder-Expo-v1_3_374-v6.zip.

## Goal
Introduce the runtime-only `HomeLayout` abstraction so AIBuilderTermux is the
canonical persistent HOME for Builder data.

## Canonical layout

- `$AI_BUILDER_HOME/` — root
- `projects/`
- `workspace/`
- `containers/ubuntu/`
- `containers/kali/`
- `toolchains/`
- `sdk/`
- `cache/`
- `logs/`
- `backups/`
- `.ai-builder/metadata/`

## Safety
This operation does not edit Android, Expo, Gradle, Java, SDK, NDK, signing,
package-manager, or other compilation configuration. No generated `android/`
directory is introduced.

## API
`createHomeLayout(root)` returns a typed immutable-shape layout object. It only
calculates paths; it does not create or delete files/directories.

## Tests
`core/home/HomeLayout.test.ts` covers canonical root, path construction,
trailing separator normalization, empty-root rejection, and path-key coverage.
