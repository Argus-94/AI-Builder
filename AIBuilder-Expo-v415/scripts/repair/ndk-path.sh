#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: probe aarch64 NDK path
set -e
if [ -d "$PREFIX/opt/android-ndk" ]; then
  echo "NDK_OK $PREFIX/opt/android-ndk"
  [ -f "$PREFIX/opt/android-ndk/source.properties" ] && head -3 "$PREFIX/opt/android-ndk/source.properties" || true
  echo REPAIR_OK:ndk
  exit 0
fi
echo NDK_MISSING
echo REPAIR_OK:ndk-missing
exit 0
