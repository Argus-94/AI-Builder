# AI Builder Userspace Runtime (open alternative to DSHA proroot)

## Why not copy proroot?

DSHA ships **proprietary** `libproroot.so` (LD_PRELOAD path translation). License:
*“Redistribution of modified binaries is not permitted.”* Upstream source is closed.

AI Builder will **never** vendor closed native blobs.

## What we built instead (v1.4.3+)

`AibUserspaceRuntime` + `RuntimeBackendRouter`:

| Property | DSHA proroot | AI Builder |
|----------|--------------|------------|
| Source | Closed | Open (this repo) |
| Path translation speed | Very high (in-process) | Termux-native ≈ zero overhead; proot-distro = standard proot |
| Fallback | proroot → proot after 3 fails | N backends, circuit-breaker, sticky/priority/fastest policies |
| Health | Limited | Probe with real commands, latency, metrics |
| Extensibility | Fixed binary | Any `RuntimeBackend` implementation |
| License risk | Proprietary | None |

### Backends

1. **termux-native** (priority 10) — direct `$PREFIX` shell; fastest when no glibc rootfs needed  
2. **proot-distro** (priority 20) — Debian/Ubuntu userspace via open proot  

### Future optional native accelerator

A fully open C/JNI module could implement LD_PRELOAD-style mapping and register as:

```ts
router.register(new AibNativeAccelBackend()); // priority 5
```

Requirements for acceptance:
- OSI-approved license (MIT/Apache-2.0)
- Redistributable modified binaries allowed
- Probe fails → router falls back automatically
- Never required for core features

Until such a module exists, **termux-native + proot-distro** cover all product needs without proprietary code.

## API

```ts
const status = await facade.initUserspaceRuntime();
const result = await facade.userspaceExec("uname -a");
const snap = facade.userspace.snapshot();
```


## Native accelerator slot (1.6.11+)

- Backend id: `aib-native-accel`, priority 5.
- Default probe: **unavailable** until open redistributable native is linked.
- Router falls back to `termux-native` / `proot-distro` automatically.
- No DSHA/proroot proprietary binaries.
