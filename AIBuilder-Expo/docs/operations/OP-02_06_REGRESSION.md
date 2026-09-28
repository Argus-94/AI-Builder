# Operation 2.6 — Execution Environment regression

Checked the new runtime environment layer and the existing compilation guard.

The Android build itself is not re-run here because the previously documented
pnpm/corepack network constraint remains external to the project. No build
settings were changed to work around it.
