#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: soft cleanup of AI Builder caches (low risk)
set -e
rm -rf "$HOME/.aibuilder-gradle/caches" 2>/dev/null || true
rm -rf "$HOME/.cache/pip" 2>/dev/null || true
df -h "$HOME" | tail -1
echo REPAIR_OK:disk-cleanup
