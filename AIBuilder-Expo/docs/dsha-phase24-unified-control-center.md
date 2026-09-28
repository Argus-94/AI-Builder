# DSHA Phase 24 — Unified Fleet Control Center

Phase 24 adds a read-oriented control-plane aggregator over the existing fleet systems.

## Aggregated domains

- Fleet Command Center: device inventory and per-device status.
- Fleet SLO Dashboard: incidents, recovery freshness and failure metrics.
- Fleet Alert Escalation: active/critical alerts and notification outbox depth.
- Fleet Policy: current local authorization policy.

## Status model

The unified status is derived deterministically:

- `incident` when critical active alerts or failed/rolled-back devices exist.
- `degraded` when active alerts or offline/unauthorized devices exist.
- otherwise the SLO status is preserved, with unknown empty fleets remaining `unknown`.

The control center does not add arbitrary shell execution, external notification credentials, or bypass existing deployment authorization.

## Runtime

Use **AI: Unified Fleet Control Center** from the Runtime panel. The result is a compact snapshot suitable for operators and for future automation.
