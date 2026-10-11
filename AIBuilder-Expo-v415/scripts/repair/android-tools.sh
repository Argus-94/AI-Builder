#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg install -y android-tools
command -v adb
echo REPAIR_OK:android-tools
