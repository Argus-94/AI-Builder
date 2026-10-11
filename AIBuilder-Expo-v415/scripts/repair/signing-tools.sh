#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
# Locate apksigner/zipalign from SDK build-tools — no unverified downloads
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$PREFIX/opt/android-sdk}}"
BT=$(ls -d "$SDK/build-tools"/*/ 2>/dev/null | tail -1)
if [ -n "$BT" ]; then
  echo "build-tools=$BT"
  command -v apksigner >/dev/null || [ -x "${BT}apksigner" ] && echo apksigner=OK
  command -v zipalign >/dev/null || [ -x "${BT}zipalign" ] && echo zipalign=OK
  echo REPAIR_OK:signing-tools
else
  echo SIGNING_TOOLS_MISSING
  exit 1
fi
