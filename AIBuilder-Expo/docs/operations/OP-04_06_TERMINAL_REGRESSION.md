# OP-04.06 — Terminal regression

Runtime-only regression for the terminal subsystem after ProcessHandle and
graceful stop/interrupt/kill were added.

## Scope

- Session create / list / close
- ProcessHandle presence
- stop / interrupt / kill control path
- HOME / PWD / AI_BUILDER_HOME environment options accepted by session options

## Out of scope

- Real process spawning
- Any change to Gradle / Expo / package manager / compilation settings
- Project file mutation

## Result markers

See `OP-04_06_RESULT.txt`.
