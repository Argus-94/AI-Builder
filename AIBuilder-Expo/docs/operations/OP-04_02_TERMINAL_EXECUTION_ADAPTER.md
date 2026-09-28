# OP-04.02 — Terminal execution adapter

Adds a runtime-only adapter between `TerminalAdapter` and an injected
`TerminalExecutionBackend`.

Delegated operations:
- session creation;
- terminal input;
- resize;
- close.

No concrete process API, PTY, shell, Termux, container, Shizuku, or root
backend is selected in this operation.
