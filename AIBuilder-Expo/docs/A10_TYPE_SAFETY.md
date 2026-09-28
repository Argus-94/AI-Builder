# A-10 — Type safety on critical boundaries

The remediation targets the boundaries identified by the audit rather than mechanically removing every `any` in the repository.

## Hardened boundaries

- `hooks/useLLM.ts` — unknown error handling and untyped intelligence/settings casts removed.
- `hooks/useAppSettings.ts` — local-model byte accounting uses the concrete engine type; catch variables are `unknown`.
- `lib/termux-bridge.ts` — native event payload has an explicit `TermuxCommandOutputEvent` contract; catch variables are `unknown`.
- `lib/agent-tools.ts` — tool-call input is accepted as `unknown`, validated into a typed boundary, and execution arguments use `Record<string, unknown>`.
- `lib/termux-agent.ts` — reverse-activity state is explicitly typed and catch variables are `unknown`; parsed protocol replies use their discriminated union directly.

## Policy

`any` is not removed mechanically from unrelated code. New agent/native/tool boundary code should prefer `unknown`, discriminated unions, concrete interfaces, or narrow type guards.

The self-test is intentionally structural and is a regression guard. Full TypeScript compilation remains part of final verification when dependencies are available.
