# DSHA Phase 10 — Release Artifact Manager

Phase 10 adds a deterministic release-artifact layer after the Phase 9 Release Gate.

## Pipeline

`Release Gate → copy verified APK → manifest → QA report → SHA-256 → checksums → ZIP/TAR.GZ bundle`

The artifact manager does **not** rebuild or modify source code and refuses to create a bundle unless `releaseAllowed === true` and a verified artifact path exists.

## Bundle layout

```text
artifacts/releases/<release-id>/
  AIBuilder-<version>.apk
  release-manifest.json
  qa-report.json
  SHA256SUM.txt
  checksums.txt
```

A `.zip` archive is preferred. If the Termux environment has no `zip` command, a `.tar.gz` archive is created instead.

## Manifest

The manifest records:
- schema version;
- product/project identity;
- application/runtime version;
- release ID and timestamp;
- Release Gate checks;
- regression report;
- exact bundled APK filename.

## Safety invariants

- blocked Release Gate ⇒ no release bundle;
- model output never directly marks a release as passed;
- QA report is copied from deterministic runner output;
- APK checksum is generated locally from the bundled artifact;
- archive path stays under the active project's `artifacts/releases` directory;
- no arbitrary shell command is accepted from the model.
