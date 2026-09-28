#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: session health echo
set -e
echo AIB_SESSION_OK
id
uname -a | head -1
echo REPAIR_OK:termux-session
