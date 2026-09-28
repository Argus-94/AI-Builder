# Operation 3.4 — Project lifecycle

Adds a runtime-only `ProjectLifecycle` orchestration layer for create/open/delete/rename.

The lifecycle coordinates the canonical `AIBuilderTermux/projects` payload tree and
`.ai-builder/metadata/projects` metadata tree. It is container-independent and does
not modify Android/Gradle/Expo compilation configuration.
