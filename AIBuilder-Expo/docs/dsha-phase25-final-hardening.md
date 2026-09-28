# DSHA Phase 25 — Final Hardening / v1.4 Release

## Goal
Freeze the architecture after Phase 24 and prepare a reproducible v1.4.0 release.

## Changes
- application version bumped from `1.3.399` to `1.4.0`;
- runtime identity is aligned to `1.4.0`;
- Phase 22/23/24 deterministic self-tests are part of the final hardening gate;
- final hardening verifies the package/lockfile contract and required DSHA modules;
- scans the source tree for private-key/AWS-key markers and forbidden local secret artifacts;
- no notification credentials are persisted by the fleet alert system;
- no arbitrary shell or new production bypass is introduced by the final phase.

## Release gate
Run:

```bash
pnpm test:phase25-final-hardening
pnpm test:phase24-unified-control-center
pnpm test:phase23-alert-escalation
pnpm test:phase22-slo-dashboard
```

For a native Android release, install dependencies and run the existing release/build checks from the project root. This phase does not claim a native build when `node_modules` or Android SDK tooling are absent.

## Stop condition
Phase 25 is the architecture freeze point. Further work should be bug fixes, security patches, dependency updates, device-specific compatibility fixes, and measured operational improvements—not additional management layers.
