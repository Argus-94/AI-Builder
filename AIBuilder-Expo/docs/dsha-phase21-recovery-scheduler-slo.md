# DSHA Phase 21 — Automated Recovery Scheduler & SLO

Phase 21 adds a persistent local recovery schedule and an SLO evaluator for fleet disaster recovery.

## Schedule

`artifacts/deployments/recovery-schedule-<channel>.json` stores the enabled flag, interval, maximum acceptable backup age, maximum acceptable successful-drill age, failure threshold, and the last/next run timestamps.

The implementation intentionally uses a bounded interval (5 minutes to 7 days). The scheduler is a deterministic runner: an app/Termux timer or another trusted scheduler calls `runFleetScheduledRecoveryCheck` when the next run is due. It does not create an unbounded background loop.

## Scheduled run

A scheduled run:

1. creates an encrypted fleet recovery point;
2. runs the Phase 20 staging-only recovery drill against that exact backup;
3. records the drill result in a bounded history;
4. advances `nextRunAt`;
5. evaluates the recovery SLO;
6. writes a JSONL alert when the drill or SLO fails.

The backup secret is supplied at runtime and is never written to schedule, SLO, alert, or history state.

## SLO

Default policy:

- backup must be <= 24 hours old;
- last successful recovery drill must be <= 48 hours old;
- more than 2 consecutive drill failures is an alert condition.

Status is `PASS`, `DUE`, or `FAIL`.

## Safety

The scheduled check never restores production state and never installs an APK. The recovery drill only decrypts/extracts into its staging directory. Existing backup verification, archive traversal checks, snapshot validation, and file hashes remain mandatory.

Alerts are append-only JSONL under the project deployment state directory and are bounded by the scheduler's operational retention policy for the surrounding backup/history data.
