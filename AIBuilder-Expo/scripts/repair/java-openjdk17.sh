#!/data/data/com.termux/files/usr/bin/bash
# Allowlisted: install OpenJDK 17
set -e
pkg install -y openjdk-17
command -v java
java -version 2>&1 | head -1
echo REPAIR_OK:java
