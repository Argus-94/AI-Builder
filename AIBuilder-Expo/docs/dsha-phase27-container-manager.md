# DSHA Phase 27 — Container Manager

Phase 27 adds a persistent **userspace container manager** on top of the Phase 26 Linux runtime.

## Backend

The default backend is `proot-distro` on Termux. It does not require root and does not run a long-lived daemon. A container is a persistent managed record whose commands execute in a fresh proot process.

Supported profiles:

- Debian (`debian:stable`)
- Ubuntu (`ubuntu:24.04`)

## Lifecycle

`create → start → exec → stop → remove`

Container metadata is stored under `AI_BUILDER_HOME/.ai-builder/metadata/proot-containers.json`.

Project data is not owned by the container. When a project is attached, it is mounted as `/workspace` and remains under the normal AI Builder project directory.

## Security boundaries

- no arbitrary shell command passthrough;
- command allowlist;
- `/workspace` is the only container working directory exposed by the manager;
- argument NUL/length checks;
- bounded execution timeout;
- no secret persistence;
- no Docker/Podman daemon dependency;
- removing a container never removes project files.

## Native containers

Docker/LXC/other native runtimes are deliberately not enabled by this phase. They can be added as a separate backend only when the Android device exposes a supported runtime.
