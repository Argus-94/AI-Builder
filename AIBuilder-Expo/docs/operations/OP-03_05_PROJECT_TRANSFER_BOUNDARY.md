# OP-03.05 — Project import/export boundary

Runtime-only boundary for portable project transfer.

- validates project names;
- rejects project-root traversal;
- excludes `.ai-builder/` HOME metadata;
- uses injected source/sink/adapter interfaces;
- does not select an archive/compression format yet.

Compilation/build settings are untouched.
