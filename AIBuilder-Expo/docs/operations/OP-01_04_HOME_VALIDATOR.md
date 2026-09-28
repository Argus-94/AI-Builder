# Operation 1.4 — HomeValidator

## Goal

Add a runtime-only, read-only validator for the canonical `AIBuilderTermux`
HOME directory tree created by `HomeInitializer`.

## Scope

`HomeValidator` checks the exact paths returned by `HOME_INITIALIZATION_PATHS`
and reports:

- `valid` — all required paths are directories;
- `root` — canonical HOME root;
- `missing` — required paths that are absent or not directories;
- `checked` — deterministic list of all inspected paths.

Filesystem access is injected through `HomeDirectoryValidatorAdapter`, so the
validator does not assume direct Android shared-storage access from the JS
runtime.

## Safety

The validator is strictly read-only. It does not create, delete, rename, or
modify any directory and does not touch Android/Gradle/Expo compilation
configuration.
