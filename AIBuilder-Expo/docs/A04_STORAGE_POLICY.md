# A-04 — Android storage / package permissions policy

## Decision

AI Builder does **not** request `MANAGE_EXTERNAL_STORAGE`.

The Termux bridge previously used a shared `/storage/emulated/0/AIBuilderTermux` directory only to exchange stdout/stderr/result markers between AI Builder and Termux. This was removed in v223.

The bridge now uses the documented Termux `RUN_COMMAND` result `PendingIntent` callback. Termux returns stdout, stderr and exit code directly to a private receiver in the AI Builder process. No shared external result directory is required.

## Permission inventory

- `MANAGE_EXTERNAL_STORAGE`: **not declared / not requested**.
- `READ_EXTERNAL_STORAGE`: **not declared**.
- `WRITE_EXTERNAL_STORAGE`: **not declared**.
- `READ_MEDIA_IMAGES/VIDEO/AUDIO`: retained for the app's media-picker use cases; these are not used as a substitute for general filesystem access.
- `com.termux.permission.RUN_COMMAND`: retained because it is the documented Termux permission required to invoke `RunCommandService`.
- `REQUEST_INSTALL_PACKAGES`: retained only for the explicit addon APK installation flow (`Shizuku` / `Termux:Boot`). The APK is downloaded into the app cache and exposed to Android's package installer through the app's non-exported `FileProvider`.

## Failure behavior

If Termux result delivery fails, the bridge returns a bounded callback timeout/error instead of falling back to a shared external-storage directory or requesting all-files access.

## Reference

Termux documents `RUN_COMMAND` result delivery through `PendingIntent` for Termux >= 0.109, including stdout, stderr and exit code. See the Termux RUN_COMMAND documentation.
