#!/data/data/com.termux/files/usr/bin/bash
set -e
if [ -f ./gradlew ]; then
  head -1 ./gradlew | head -c 40; echo
  echo REPAIR_OK:gradle-wrapper
else
  echo GRADLEW_MISSING
  exit 1
fi
