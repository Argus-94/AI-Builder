# Termux Agent incident fix — 2026-09-25

## Reproduced from user log

The free OpenRouter model returned a long planning/reasoning response that *mentioned* `TERMUX_RUN:` and `TERMUX_DONE:` but did not emit either protocol marker as a standalone protocol line. The agent previously used a broad `hasMarker` substring check, so the prose was incorrectly considered to contain a valid protocol marker and could terminate the agent instead of requesting a valid machine-protocol reply.

The log also shows an environment probe reporting only `gradle ok` despite a multi-tool probe command. That probe is now treated as evidence only when each required tool explicitly reports success; a successful shell exit alone is not sufficient proof of tool availability.

## Fix

- Protocol extraction now recognizes markers only at the beginning of a line, optionally preceded by markdown `*` characters.
- A mention of `TERMUX_RUN:` inside prose no longer counts as a valid protocol marker.
- In Termux-agent mode, a model turn without a real protocol marker is rejected and the model is prompted again instead of being returned as a final answer.
- Added a regression test reproducing the exact failure pattern from the supplied log.

## Verification

- `AIB_TERMUX_PROTOCOL_LOG_REGRESSION_SELFTEST_OK`
- `AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK ts=314 js=110 json=5 sh=1`
