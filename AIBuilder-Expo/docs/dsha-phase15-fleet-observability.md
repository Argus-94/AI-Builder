# DSHA Phase 15 — Fleet Observability & Incident Center

Phase 15 adds a read-only fleet dashboard snapshot and incident persistence on top of Phase 14 canary rollout.

## Capabilities

- Aggregate canary and fleet state per release channel.
- Compute attempted/healthy/failed counts and failure rate.
- Classify status as `healthy`, `degraded`, `incident`, or `unknown`.
- Persist up to 50 incident summaries per channel.
- When a canary is stopped, create a bounded incident bundle under `artifacts/deployments/incidents/<incident-id>/` containing:
  - `incident.json` with the canary/fleet state snapshot;
  - `SUMMARY.txt` with human-readable incident facts.
- Acknowledge incidents without mutating rollout/device state.

## Security

- Release channel and incident IDs are validated before filesystem access.
- Paths are derived only from the active project path and fixed artifact layout.
- Model output is not used as shell commands, device serials, or filesystem paths.
- Incident data is bounded to the most recent 50 records.

## Runtime UI

The Runtime screen exposes **AI: Fleet Observability + Incidents**. It reports current channel status, healthy/attempted devices, failure rate, incident count, and canary stage summaries.
