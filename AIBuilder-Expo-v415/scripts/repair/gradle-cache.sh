#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
rm -rf "${HOME}/.aibuilder-gradle/caches" 2>/dev/null || true
rm -rf "${GRADLE_USER_HOME:-$HOME/.gradle}/caches" 2>/dev/null || true
echo REPAIR_OK:gradle-cache
