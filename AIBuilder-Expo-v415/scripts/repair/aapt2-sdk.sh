#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: locate aapt2 in SDK build-tools
set -e
if command -v aapt2 >/dev/null 2>&1; then
  command -v aapt2
  echo REPAIR_OK:aapt2
  exit 0
fi
found=$(find "$PREFIX/opt/android-sdk/build-tools" -name aapt2 -type f 2>/dev/null | head -1)
if [ -n "$found" ]; then
  echo "$found"
  echo REPAIR_OK:aapt2
  exit 0
fi
echo AAPT2_MISSING
exit 1
