# Operation 1.5 — HOME diagnostics

Added `core/home/HomeDiagnostics.ts` as a read-only runtime diagnostics adapter.

It reports:
- AIBuilder HOME status;
- canonical path;
- complete/missing HOME directories;
- read/write/execute capability when the runtime adapter exposes them;
- free space when available.

No Android/Gradle/Expo compilation settings are changed.
