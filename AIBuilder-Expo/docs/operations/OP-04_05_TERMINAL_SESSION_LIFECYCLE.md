# OP-04.05 — Terminal session lifecycle

Adds a runtime-only `TerminalSessionManager`.

Responsibilities:
- register terminal sessions;
- prevent duplicate session IDs;
- query/list active sessions;
- close one session;
- close all sessions.

Actual terminal execution remains delegated to the existing injected
`TerminalAdapter`.
