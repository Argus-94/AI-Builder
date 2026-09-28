# AI Builder v1.4.2 — DSHA-Surpassing Runtime Layer

## Goal
Implement runtime/diagnostics/backup/repair capabilities that meet or exceed DSHA's production patterns, written from scratch for Expo/RN/Termux (no proprietary proroot, no Java port).

## Delivered

| Capability | DSHA | AI Builder 1.4.2 |
|------------|------|------------------|
| Maintenance barrier | RuntimeTasks | RuntimeTaskGate + drain timeout |
| Transactions | BackupTask flow | RuntimeTransaction (prepare→mutate→verify→commit/rollback) |
| Journal recovery | recovery transaction log | RuntimeJournal + recoverPendingTransactions |
| Backup integrity | SHA-256 + staging | BackupIntegrity format 2 + digest/fileCount |
| Safe restore | stage + old tree | RestoreTransaction + optional pre-backup + rollback |
| Startup diagnostics | StartupTrace 5 records | StartupTrace (last 5 boots) |
| Self-checks + repair | 23 checks + scripts | DiagnosticRule registry + DeterministicRepair recipes |
| Identity | app+ubuntu+dsh | RuntimeIdentity (schema/rootfs boundary) |
| Device | ADB/Shizuku/Root | Existing DeviceAgent* (stronger agent loop) |

## New files
- core/runtime/RuntimeTransaction.ts
- core/backup/BackupIntegrity.ts, RestoreTransaction.ts
- core/diagnostics/DiagnosticRule.ts, StartupTrace.ts, FailureJournal.ts, RepairManager.ts
- core/diagnostics/rules/BuiltinRules.ts
- core/recovery/DeterministicRepair.ts
- scripts/aib-runtime-transaction-selftest.mjs

## Intentionally NOT ported
- proroot (proprietary)
- GeckoView / DSHA UI
- Java Activity architecture

## Verification
- AIB_RUNTIME_TRANSACTION_SELFTEST_OK
- AIB_COMPILATION_SETTINGS_GUARD_OK
- AIB_FULL_SOURCE_SYNTAX_SELFTEST_OK
- AIB_STARTUP_SAFETY_SELFTEST_OK

## Compilation settings
Unchanged except intentional package.json version 1.4.2 + guard baseline hash.
