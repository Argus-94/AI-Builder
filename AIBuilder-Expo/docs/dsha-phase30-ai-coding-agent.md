# DSHA Phase 30 — AI Coding Agent

Phase 30 adds a bounded coding-agent layer above the Linux/proot workspace.

## Flow

`goal -> planner -> bounded file edits -> install/build/test -> repair -> bounded retry`

The planner is injectable. The default planner is deterministic and only applies
small known-safe repairs. A model-backed planner may be supplied by the host
application without giving the model arbitrary host-shell access.

## Safety boundaries

- All edits are relative to `/workspace`.
- Path traversal and absolute paths are rejected.
- Maximum 32 edits per iteration.
- Maximum 128 KiB per edited file.
- Maximum 2 MiB of edits per iteration.
- Maximum 5 iterations; default 3.
- Existing Workspace Builder timeouts remain active.
- No arbitrary host shell is exposed through the coding-agent API.

## Runtime API

`RuntimeFacade.runAICodingAgent(containerId, request)`

The result contains iteration summaries, build/test evidence, changed files and
final failure information.
