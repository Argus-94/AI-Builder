# OP-00_04 — Hash manifest

Operation 0.4 creates the SHA-256 baseline for every regular file present in the v3 project archive before this operation.

- Project version: **1.3.374**
- Input archive: `AIBuilder-Expo-v1_3_374-v3.zip`
- Hash algorithm: **SHA-256**
- Files covered: **261**
- Manifest: `OP-00_04_HASH_MANIFEST.json`

The manifest is a verification baseline only. No project compilation settings, source files, dependencies, or build configuration were intentionally changed by this operation.

Future operations must compare the relevant files against this baseline and stop if protected compilation/build settings change unexpectedly.
