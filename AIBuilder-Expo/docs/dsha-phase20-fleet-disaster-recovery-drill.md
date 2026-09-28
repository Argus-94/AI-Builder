# DSHA Phase 20 — Fleet Disaster Recovery Drill

Phase 20 adds an isolated recovery drill for encrypted fleet backups.

## Flow

1. Select the newest backup (or an explicit backup ID).
2. Verify SHA-256 and HMAC integrity.
3. Decrypt into `artifacts/deployments/recovery-drills/<drill-id>/`.
4. Validate tar paths against traversal/absolute-path attacks.
5. Extract only into the staging directory.
6. Validate snapshot schema and manifest hash.
7. Recompute every snapshot file hash.
8. Write a small `DRILL-RESULT.json` and remove decrypted/extracted material.

The drill **never writes production fleet state** and never installs an APK. A PASS means the selected backup could be decrypted, safely extracted, and its recovery snapshot integrity verified in isolation.

## Periodic operation

The drill function is deterministic and bounded, so a scheduler can invoke it periodically. No persistent backup secret is stored by the drill.
