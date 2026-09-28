# DSHA Phase 19 — Fleet Backup & Disaster Recovery

Phase 19 adds encrypted, integrity-checked fleet control-state backups on top of Phase 18.

## Scope

Backups contain fleet control state represented by the Phase 18 recovery snapshot: policy, audit logs, channel state, fleet deployment state, canary state and incident state. APKs and source trees are intentionally not copied into these recovery bundles.

## Security model

- Backup payload is compressed and encrypted with `AES-256-CBC` using OpenSSL PBKDF2 + salt.
- The caller supplies a secret of at least 12 characters; the secret is never written to the backup manifest or retained by the app.
- The encrypted payload receives an HMAC-SHA256 signature and a SHA-256 digest.
- Verification checks both digest and HMAC before restoration.
- Restored snapshots are revalidated for manifest hash, per-file hash and path traversal before they enter the Phase 18 recovery store.
- Backup retention is bounded to 1–30 records; default is 5.

## Automatic production recovery point

`runAIProductionDeployment` accepts an optional `backupSecret`. When the target channel is `production` and a secret is supplied, a backup is created immediately before the deployment attempt with reason `pre-production-rollout`.

No secret means no automatic encrypted backup is created. The existing deployment and rollback flow remains available.

## Files

Backups live under:

`artifacts/deployments/backups/`

Each backup has:

- `.tar.gz.enc` — encrypted payload;
- `.sig` — HMAC-SHA256;
- `.json` — backup manifest.

Retention pruning removes old backup artifacts while leaving Phase 18 recovery snapshots intact.

## Operations

- Create encrypted backup
- List recent backups
- Verify latest/specified backup
- Restore a verified backup
- Automatic pre-production backup when a secret is supplied

## Safety

Backup restore does not execute commands contained in the archive. It only restores validated JSON state files through the existing Phase 18 snapshot validation path.
