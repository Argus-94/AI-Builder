# DSHA Phase 9 — AI Release Gate

The release gate is a final deterministic barrier after self-healing QA.

## Acceptance rules

1. `assembleDebug` must complete successfully.
2. A real APK output must exist.
3. APK signing must be verified as V1+V2+V3.
4. Device regression is required by default.
5. The generated suite must contain at least one case and every case must pass local assertions.
6. Model output never directly sets release status.
7. If ADB/device is unavailable while regression is required, release is blocked.
8. The gate does not edit source code; repairs remain the responsibility of Phase 8.

The result contains explicit checks, artifact path (only when allowed), and regression evidence location.
