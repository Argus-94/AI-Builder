# OP-04.01 — Terminal abstraction

Introduces a runtime-only terminal contract.

The abstraction covers:
- terminal session identity;
- working directory;
- environment passed by the caller;
- terminal size;
- input;
- output stream typing;
- resize;
- close.

It deliberately does not choose a shell, process API, PTY implementation,
Termux API, native bridge, Shizuku, root, or container runtime. Those are
later adapters.

Compilation settings remain outside this abstraction.
