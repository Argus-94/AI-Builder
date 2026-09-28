# OP-04.04 — ExecResult

Introduces a normalized runtime-only result model for command execution.

It records:
- command and argument vector;
- exit code, including `null` when no exit code is available;
- optional terminating signal;
- stdout and stderr;
- elapsed duration.

`ExecResult` does not execute processes or select an execution backend.
