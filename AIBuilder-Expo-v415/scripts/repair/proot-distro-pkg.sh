#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
pkg install -y proot-distro
command -v proot-distro
echo REPAIR_OK:proot-distro-pkg
