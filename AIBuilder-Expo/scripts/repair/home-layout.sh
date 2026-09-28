#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: ensure durable HOME layout
set -e
mkdir -p "$HOME/.aibuilder" "$HOME/AIBuilderTermux" "$HOME/projects"
ls -ld "$HOME/.aibuilder" "$HOME/AIBuilderTermux" "$HOME/projects"
echo REPAIR_OK:home-layout
