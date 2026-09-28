# DSHA Phase 22 — Fleet SLO Dashboard & Alert Center

Phase 22 adds a read-only aggregate dashboard over Fleet Observability (Phase 15) and Recovery SLO/Scheduler (Phase 21).

## Dashboard

`getFleetSloDashboard()` combines:
- fleet/canary health and failure rate;
- open and total incidents;
- backup freshness;
- recovery-drill freshness;
- consecutive recovery failures;
- scheduler state and next run;
- recent recovery alerts;
- a bounded 100-event timeline.

Overall status is derived locally. A failed recovery SLO forces `incident`; a due recovery check can make an otherwise healthy fleet `degraded`.

## Acknowledgement

Incident and alert acknowledgement changes only their acknowledgement timestamp. It does not clear the underlying failure, change rollout state, or bypass policy.

## Security

The dashboard is read-only except for acknowledgement. It does not execute ADB commands, deploy APKs, rollback releases, or accept arbitrary shell input. Paths are constrained to the project's `artifacts/deployments` area through the existing runtime environment boundary.

## Alert history

Recovery scheduler alerts remain JSONL and are bounded to the latest 50 entries when read by the dashboard. The timeline is bounded to 100 events.
