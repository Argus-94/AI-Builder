# DSHA Phase 17 — Fleet Policy & Access Control

Phase 17 adds a project-scoped fleet policy layer around deployment, rollback and canary operations.

## Roles

- `viewer` — read-only fleet visibility.
- `operator` — non-production deploy/rollback/canary and fleet operations.
- `release-manager` — production deploy/canary/rollback with explicit confirmation.
- `admin` — full policy-managed fleet operations.

## Production confirmation

Production deploy/canary/rollback requires the configured confirmation phrase by default (`DEPLOY PRODUCTION`). The phrase can be changed by the local policy editor.

## Audit

Every authorization attempt and execution is appended to:

`artifacts/deployments/fleet-audit.jsonl`

Entries contain timestamp, role, action, channel, optional device serial, result and failure reason.

## Policy state

Stored at:

`artifacts/deployments/fleet-policy.json`

This is a local project policy/profile, not an identity provider or cryptographic authentication system. It must not be treated as proof of user identity. A real multi-user deployment should put authentication and authorization at the trusted service boundary.

## Security properties

- Production actions are explicitly gated.
- Device serials and channels are validated.
- Models cannot bypass the policy by emitting arbitrary shell commands.
- Authorization is checked immediately before fleet actions.
- Failed authorization is audited.
- Execution failures are audited.
