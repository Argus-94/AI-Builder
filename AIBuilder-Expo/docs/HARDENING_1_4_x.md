# AI Builder 1.4.x Runtime Hardening Summary

## Versions

| Ver | Focus |
|-----|--------|
| 1.4.1 | Startup UX: no auto battery settings |
| 1.4.2 | RuntimeTransaction, Journal, Backup format 2, DiagnosticRule, DeterministicRepair |
| 1.4.3 | AibUserspaceRuntime + BackendRouter (open proroot alternative) |
| 1.4.4 | LiveProbes, MaintenanceCoordinator, foreground-task, Health UI |
| 1.4.5 | Agent protocol abort (5 invalid), Settings survival, journal recover on init |
| 1.4.6 | Agent × repair hints from [ENV], Userspace UI card |
| 1.4.7 | repair-script-runner allowlist, i18n Health/Userspace, StartupTrace API |
| 1.4.8 | StartupTrace at AppLayout boot, useRuntime health/userspace API |

## Architecture (surpasses DSHA control plane)

```
AppLayout
  └─ StartupTrace.begin / journal recover / markReady
RuntimeFacade
  ├─ RuntimeTaskGate (maintenance drain)
  ├─ RuntimeTransaction + RuntimeJournal
  ├─ RuntimeMaintenanceCoordinator
  ├─ BackupManager → RestoreTransaction + format 2
  ├─ RuntimeHealth → DiagnosticRule + LiveProbes + RepairManager
  ├─ DeterministicRepair + repair-script-runner (allowlist)
  ├─ AibUserspaceRuntime → TermuxNative | ProotDistro
  └─ Device / Agent / Containers (existing)
Termux agent
  ├─ invalidStreak → AGENT_PROTOCOL_ABORT
  └─ [DETERMINISTIC_REPAIR] from ENV probe
```

## Intentionally excluded

- Proprietary proroot binaries
- GeckoView / DSHA UI

## Verification scripts

- aib-runtime-transaction-selftest.mjs
- aib-userspace-runtime-selftest.mjs
- aib-live-health-selftest.mjs
- aib-agent-protocol-hardening-selftest.mjs
- aib-agent-repair-hints-selftest.mjs
- aib-repair-runner-selftest.mjs
- aib-startup-safety-selftest.mjs
- aib-compilation-settings-guard-selftest.mjs


---

## 1.6.x closeout (plan.md A–H + G stub + P2)

| Ver | Focus |
|-----|--------|
| 1.6.0–1.6.7 | Keep-alive, diagnostics catalog, BootstrapPipeline, Backup UX, ADB wizard, agent glue, SupervisorPolicy |
| 1.6.8 | home-layout / ndk / aapt2 rules + repair scripts |
| 1.6.9 | runtime.tsx ScrollView JSX fix; Health export JSON |
| 1.6.10 | A4 soft survival reminder; bootstrap FG + notify |
| 1.6.11 | aib-native-accel backend slot; profile export/import; privilege.shizuku |
| 1.6.12 | Shizuku detect+provider harden; repair scripts →15; HARDENING update |

**Still optional:** real open C/JNI `.so` for `aib-native-accel` (separate MIT/Apache repo); full Shizuku binder bridge beyond detect/rish.

**Hard rules still hold:** no proprietary proroot; no auto battery settings on cold start; repair only allowlist/recipes.


### 1.6.20
- assembleDebug process registry watch + health marks.
- Plan A–H operational closeout documented in plan-dsha-parity.md.
