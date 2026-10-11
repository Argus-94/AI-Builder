#!/data/data/com.termux/files/usr/bin/bash
set -e
set -o pipefail
AIB_PRIVATE_ROOT="${AIB_PRIVATE_ROOT:-$HOME/.aibuilder}"
# Safe cache cleanup — does not touch project sources
rm -rf "$AIB_PRIVATE_ROOT/cache/deps"/*.tmp.* 2>/dev/null || true
# Keep last few dep caches; remove empty dirs
find "$AIB_PRIVATE_ROOT/cache" -type d -empty -delete 2>/dev/null || true
echo REPAIR_OK:disk-cache
