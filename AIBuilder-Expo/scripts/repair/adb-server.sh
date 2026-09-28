#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: restart adb server
set -e
command -v adb >/dev/null 2>&1 || { echo "adb missing — pkg install android-tools"; exit 1; }
adb kill-server 2>/dev/null || true
adb start-server
adb devices || true
echo REPAIR_OK:adb-server
