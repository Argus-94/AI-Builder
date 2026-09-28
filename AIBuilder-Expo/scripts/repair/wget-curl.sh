#!/data/data/com.termux/files/usr/bin/bash
set -e
pkg install -y wget curl
command -v wget
command -v curl
echo REPAIR_OK:wget-curl
