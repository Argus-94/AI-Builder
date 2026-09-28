# DSHA Phase 18 — Secure Fleet Audit & Recovery Center

Phase 18 adds a tamper-evident audit chain and bounded fleet-state recovery.

## Audit chain

`fleet-audit-chain.jsonl` stores each fleet operation with `prevHash` and SHA-256 `hash`. The hash input is `prevHash + newline + canonical audit entry`. Verification stops on the first broken link or digest mismatch.

The legacy `fleet-audit.jsonl` remains available for compatibility; the chained log is authoritative for integrity verification.

## Recovery snapshots

Snapshots are stored below `artifacts/deployments/recovery/` and contain only bounded fleet-control state: policy, audit logs, channel state, fleet state, canary state, and incident state. Each file has a SHA-256 digest and the snapshot manifest has its own digest.

Restore rejects invalid paths, manifest tampering, and per-file digest mismatches.

## Audit export

The manager can export a bounded JSON audit bundle and a `tar.gz` archive. Channel filtering is validated locally. Incident IDs and serials are constrained to safe segments.

## Security model

- No arbitrary shell is accepted from model output.
- Paths are fixed to the project deployment/recovery tree.
- Production deployment policy remains enforced by Phase 17.
- Recovery does not restore APK binaries or source code.
- A recovery snapshot is state recovery, not authentication or cryptographic key recovery.
