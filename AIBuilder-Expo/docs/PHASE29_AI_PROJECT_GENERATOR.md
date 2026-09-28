# Phase 29 — AI Project Generator

Phase 29 adds a bounded project-generation layer on top of the Phase 27 proot Container Manager and Phase 28 Workspace Builder.

## Flow

`request -> generate bounded files -> install -> build -> test`

The generator writes only inside the mounted container `/workspace`. It accepts no host path, limits file count and file sizes, rejects traversal/absolute paths, and delegates execution to the existing container/workspace policy layers.

## Templates

- `node`
- `expo`
- `python`

Optional generated files can be supplied by an upstream AI planner, subject to the same path and size limits.

## Safety

- maximum 64 files;
- maximum 128 KiB per file;
- maximum 2 MiB generated payload;
- relative paths only;
- no `..` traversal;
- workflow remains bounded by the existing Workspace Builder timeouts;
- no external secrets are persisted.

Phase 29 does not claim to be a general autonomous coding agent yet; it provides the deterministic project-generation/execution contract that an LLM planner can target.
