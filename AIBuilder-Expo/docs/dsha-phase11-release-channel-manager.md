# DSHA Phase 11 — Release Channel Manager

Phase 11 adds controlled release channels on top of the Phase 10 artifact bundle.

## Channels

- `debug`
- `internal`
- `beta`
- `production`

A channel can only receive an artifact after the Phase 9 Release Gate has passed and Phase 10 has created a verified artifact bundle.

## State

Each channel stores:

```text
artifacts/channels/<channel>/
  channel.json
  current.apk
  <release-id>-<versionName>-<versionCode>.apk
```

`channel.json` contains the current release and up to 50 historical entries. `current.apk` is updated only after the immutable release APK has been copied successfully.

## Versioning

`versionName` is the runtime/application version. If no `versionCode` is supplied, the manager allocates the next monotonic channel-local code. An explicit positive integer can be supplied when the Android build already owns the authoritative versionCode.

## Rollback

Rollback never rebuilds source code. It selects a previous published entry, verifies its APK exists, atomically updates the channel state, and replaces `current.apk` with the selected verified APK.

## Safety

- Release Gate blocked → channel publication blocked.
- Missing/invalid artifact → channel publication blocked.
- State writes use temporary files followed by `mv`.
- Model output never selects a release as passed.
- No arbitrary shell commands are accepted from the model.
- Rollback targets only entries already recorded in the channel history.
