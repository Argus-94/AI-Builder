# A-08 — Toolchain download integrity

## Security contract

Every `InstallStep.download` is treated as executable supply-chain input. The installer must have a 64-hex-character SHA-256 pin before it can accept a downloaded artifact. Size checks, archive tests, HTTPS, or a successful HTTP response are not substitutes for the digest.

The runtime verifies `sha256sum` after the archive/JAR passes its format check and **before** `step.primary` is executed. A mismatch deletes the downloaded file and fails the URL. A missing pin fails closed with `DOWNLOAD_SHA256_REQUIRED:<step>`.

## Source policy

- Toolchain downloads use pinned first-party/vendor URLs only.
- `ghproxy`, `mirror.ghproxy`, and similar third-party proxy URLs are not accepted.
- Dynamic discovery of newer Google repository URLs is not part of the install path because a discovered artifact would not have a reviewed digest.
- A version bump must add a new reviewed SHA-256 in the same change.

## Current reviewed pins

| Artifact | SHA-256 | Evidence used for pinning |
|---|---|---|
| Android build-tools r34 Linux | `e858c4b60069d0431051b225d384413b1643e1289b00a4825aed347f25bd510f` | Public package metadata with the exact filename |
| dex2jar v2.4 | `ee7c45eb3c1d2474a6145d8d447e651a736a22d9664b6d3d3be5a5a817dda23a` | OpenBSD package distinfo for the exact release archive |
| smali 3.0.10 fat | `32fa0e88a6c397b3922201adf5f3e534fbaed5a663c71d0c558c3ddce0af844a` | Upstream GitHub release asset digest |

Some legacy download entries currently have no independently reviewed SHA-256. They intentionally fail closed rather than silently accepting an unpinned archive. This is by design: adding a hash is a deliberate release change, not a runtime trust decision.

## Test

Run:

`node scripts/aib-toolchain-integrity-selftest.mjs`

Expected:

`AIB_TOOLCHAIN_INTEGRITY_SELFTEST_OK pinned=3 fail_closed=6`
