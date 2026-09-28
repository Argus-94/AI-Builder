# Operation 3.2 — ProjectStorage

Adds a runtime-only persistence boundary for project files.

## Contract

- All project storage is rooted at `AIBuilderTermux/projects`.
- Project names reuse the existing `ProjectManager` validation.
- Project file names are single path components; traversal and nested path input are rejected.
- The filesystem is injected, so the core remains independent of Node/Termux/Android filesystem APIs.
- Storage has no dependency on containers or execution environments.
- No Android/Gradle/Expo compilation settings are read or modified.

## Scope boundary

This operation does not change project discovery, execution, toolchains, or build configuration. Those remain separate runtime layers.
