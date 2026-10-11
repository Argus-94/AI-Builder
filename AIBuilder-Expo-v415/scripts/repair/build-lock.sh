#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
# Clear stale Gradle/daemon locks under AI Builder homes only
for d in "${HOME}/.aibuilder-gradle" "${GRADLE_USER_HOME:-}" "${HOME}/.gradle"; do
  [ -n "$d" ] && [ -d "$d" ] || continue
  find "$d" -name "*.lock" -type f -delete 2>/dev/null || true
  find "$d" -name "registry.bin.lock" -type f -delete 2>/dev/null || true
done
echo REPAIR_OK:build-lock
