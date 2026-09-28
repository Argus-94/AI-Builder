# OP-04.03 — CommandSpec

Introduces a runtime-only, shell-agnostic command description.

`CommandSpec` contains:
- command token;
- optional argument array;
- optional working directory;
- optional environment map.

Validation rejects control characters and invalid environment keys.

Important boundary: `CommandSpec` does not execute anything. Shell quoting,
process spawning, PTY allocation, privilege providers and container
selection remain outside this operation.
