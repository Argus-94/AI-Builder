# AI Builder - План исправлений и тестирования v399

## ✅ ЭТАП 1: Build Hardening (ЗАВЕРШЕНО)
- [x] gradle.properties - AGP 8+, Jetifier, BuildConfig, Kotlin incremental
- [x] metro.config.js - resolver и block-list
- [x] tsconfig.json - JSX, moduleResolution, types
- [x] withEnsureBuildConfig.js - deduplication, package sync
- [x] withLlamaRnProguard.js - file creation safeguard
- [x] withAibNativeAccel.js - error handling, validation
- [x] withAndroidWindowSoftInput.js - error handling
- [x] withAibDeviceWatchdog.js - comprehensive error handling

## 🔄 ЭТАП 2: Runtime Safety (В ПРОЦЕССЕ)
### 2.1 Permission Guards
- [ ] AndroidManifest.xml - проверить все разрешения
- [ ] Runtime permission checks - DANGEROUS_PERMISSIONS
- [ ] Permission denial fallbacks

### 2.2 Network & Connectivity
- [ ] Network state checks перед запросами
- [ ] HTTP/HTTPS validation
- [ ] Timeout handling (120s default)
- [ ] Retry logic с exponential backoff

### 2.3 File Operations
- [ ] Path traversal protection
- [ ] File size limits (models, downloads)
- [ ] Disk space checks
- [ ] Temporary file cleanup

### 2.4 Process Lifecycle
- [ ] Activity lifecycle guards
- [ ] Service lifecycle safety
- [ ] Null pointer protection
- [ ] Resource cleanup (onDestroy, finally blocks)

### 2.5 Data Persistence
- [ ] SharedPreferences encryption (if sensitive data)
- [ ] Database transaction safety
- [ ] State restoration after crash
- [ ] Backup/restore validation

## 🧪 ЭТАП 3: Functional Testing
### 3.1 Core Flows
- [ ] App launch (cold start)
- [ ] App launch (warm start)
- [ ] Permission request/denial scenarios
- [ ] Network on/off transitions

### 3.2 User Interaction
- [ ] Chat input/output
- [ ] Model loading
- [ ] File upload/download
- [ ] Settings persistence

### 3.3 Edge Cases
- [ ] Empty inputs
- [ ] Very large inputs
- [ ] Rapid button clicks
- [ ] Memory pressure
- [ ] Process kill recovery

## 📋 ЭТАП 4: Security Audit
### 4.1 Secrets & Keys
- [ ] API keys handling
- [ ] Token storage
- [ ] Credentials in logs
- [ ] Intent extra validation

### 4.2 WebView (если есть)
- [ ] JavaScript injection prevention
- [ ] File:// protocol blocking
- [ ] Content validation

### 4.3 Deep Links
- [ ] Intent filter validation
- [ ] Path traversal in deep links
- [ ] Exported component security

## 📊 ЭТАП 5: Performance & Stability
### 5.1 Crash Reporting
- [ ] Unhandled exception catching
- [ ] ANR (Application Not Responding) prevention
- [ ] Memory leak detection

### 5.2 Performance
- [ ] Main thread blocking detection
- [ ] Coroutine cancellation
- [ ] Database query optimization
- [ ] Image loading optimization

## 🚀 Примечание по запуску
Все этапы проверяются в реальном режиме на:
- Android эмуляторе (API 31+)
- Реальном устройстве (если возможно)
- С включением Network Profiler, Memory Profiler в Android Studio
