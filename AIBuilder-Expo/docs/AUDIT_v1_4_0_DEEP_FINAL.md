# AI Builder v1.4.0 — Final Deep Audit

Date: 2026-09-25

## Scope

Second-pass audit of the Phase 36 codebase after the previous deep audit. The review covered Phase 26–36 Linux/container/workspace/LLM/build/device orchestration, all repository self-tests, source syntax, local import references, package/lockfile consistency, release checks, and archive integrity.

## Additional defects found and fixed

1. Linux Runtime exposed `sh`/`bash` through the exact command allowlist; removed them to prevent `-c` shell bypass.
2. Linux Runtime accepted `/workspace/../...` and `/workspace-evil`-style cwd values; added strict cwd validation.
3. Linux rootfs fallback reported available when `proot` itself was missing; status now requires both rootfs and proot.
4. Proot Container Manager accepted cwd traversal through `/workspace/..`; added strict workspace cwd validation.
5. One-Click Factory recorded failed-stage duration from the failure timestamp, producing approximately zero duration; it now tracks stage start time.
6. LLM Coding Brain sent raw goal/build/memory context to the provider while workspace files were redacted; these context fields are now passed through the same secret redaction layer.
7. Existing Project Memory was normalized in memory but not persisted back to disk; sanitized/normalized memory is now rewritten when loaded.

## Verification

All `scripts/aib-*-selftest.mjs` passed with `SELFTEST_FAILS=0`.

Additional checks:

- `AIB_FINAL_DEEP_AUDIT_SELFTEST_OK checks=9`
- `AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK ts=314 js=109 json=5 sh=1`
- `AIB_DEEP_AUDIT_SELFTEST_OK checks=21`
- `AIB_PHASE36_ONE_CLICK_APP_FACTORY_SELFTEST_OK`
- `npm run test:release` passed
- archive `unzip -t` passed
- no hard-coded credential material detected by the final credential scan

## Environment limitation

A physical Android/ADB/SDK end-to-end build and install was not available in this audit environment. The repository therefore does not claim a real-device PASS. `test:real-env` correctly reports missing `adb`, `sdkmanager`, Android SDK environment variables, and the generated `android/` project; Gradle wrapper presence is detected.

## Residual architectural note

The proot container layer is a userspace isolation mechanism, not a kernel VM or a hardened security sandbox. Debian/Ubuntu profiles may share the underlying proot-distro root filesystem. The coding agent remains constrained by its path/size/iteration policy, but untrusted code should not be treated as equivalent to a security-isolated VM.

## Baseline update

The compilation-settings guard baseline for `package.json` was intentionally updated after adding the final audit self-test command. The new SHA-256 is `f5209c48cd6063d2dcfbf5ca8c12d31591c235c7fbfca174721ee5747902dc06`, and the guard self-test passes against that baseline.
