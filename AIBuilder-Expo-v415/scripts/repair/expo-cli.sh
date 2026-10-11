#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
# Use only the project-pinned Expo CLI; never download and execute an unpinned package.
if [ -x "node_modules/.bin/expo" ]; then
  ./node_modules/.bin/expo --version 2>&1 | tail -5
else
  echo "EXPO_CLI_MISSING: install this project from its lockfile first" >&2
  exit 127
fi
command -v node
echo REPAIR_OK:expo-cli
