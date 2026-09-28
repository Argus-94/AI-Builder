#!/data/data/com.termux/files/usr/bin/bash
set -e
SDK="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-$PREFIX/opt/android-sdk}}"
echo "sdk.dir=$SDK" > local.properties
cat local.properties
echo REPAIR_OK:local-properties
