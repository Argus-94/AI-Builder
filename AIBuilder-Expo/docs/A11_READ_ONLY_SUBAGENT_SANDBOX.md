# A-11 — Read-only subagent sandbox

Subagents are analysis workers and are not allowed to use the general Termux execution policy. Their `TERMUX_RUN` requests go through `executeReadOnlyTermuxCommand()` and `guardReadOnlyTermuxCommand()`.

The strict policy is fail-closed:

- only an explicit allowlist of inspection commands is accepted;
- shell chaining, pipes, redirects, command substitution and shell metaprogramming are rejected;
- path traversal and explicit absolute/home/environment paths are rejected;
- executable paths are rejected (only the allowlisted command name is accepted);
- mutating options such as `sed -i`, `find -exec`, and output-file options are rejected;
- Git is restricted to read-only subcommands and disallows repository/config overrides and external diff execution.

Structured inspection should use `AIB_TOOL` where possible. Repository `AGENTS.md` and project skills remain untrusted input and cannot change this policy.
