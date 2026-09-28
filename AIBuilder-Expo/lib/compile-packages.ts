/**
 * Пакеты для компиляции APK в Termux.
 * Каждый пакет — отдельная кнопка: install → wait → verify → mark installed.
 * Удаление — pkg uninstall.
 * Прогресс в % симулируется по этапам + таймеру, т.к. pkg не отдаёт проценты.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { runShellCommand, type TermuxCommandResult } from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";
import { withInstallerEnvironment, withCheckEnvironment } from "./termux-installer-env";

export type CompilePkgId =
  | "openjdk-17"
  | "git"
  | "android-sdk"
  | "android-ndk"
  | "gradle"
  | "ant"
  | "maven"
  | "build-essential"
  | "clang"
  | "make"
  | "cmake"
  | "wget"
  | "curl"
  | "nano"
  | "vim"
  | "zip-unzip"
  | "nodejs"
  | "pnpm"
  | "npm"
  | "kotlin"
  | "python"
  | "termux-api"
  | "aapt2"
  | "zipalign"
  | "apksigner"
  | "platform-tools"
  | "which"
  | "ninja"
  | "sdk-cmdline-tools"
  | "android-platform-34"
  | "android-platform-35";

export interface CompilePackageDef {
  id: CompilePkgId;
  /** Отображаемое имя (RU/UK) */
  name: string;
  nameEn: string;
  /** pkg install -y ... */
  installCmd: string;
  /** exit 0 = установлено */
  checkCmd: string;
  /** pkg uninstall -y ... */
  removeCmd: string;
  /** Примерное время установки (сек) для симуляции % */
  estimateSec: number;
  /** Порядок в списке */
  order: number;
}

export const COMPILE_PACKAGES: CompilePackageDef[] = [
  {
    id: "wget",
    name: "Wget",
    nameEn: "Wget",
    installCmd: "pkg install -y wget",
    checkCmd: "command -v wget >/dev/null 2>&1 && wget --version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y wget",
    estimateSec: 15,
    order: 1,
  },
  {
    id: "curl",
    name: "Curl",
    nameEn: "Curl",
    installCmd: "pkg install -y curl",
    checkCmd: "command -v curl >/dev/null 2>&1 && curl --version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y curl",
    estimateSec: 15,
    order: 2,
  },
  {
    id: "zip-unzip",
    name: "Zip / Unzip",
    nameEn: "Zip / Unzip",
    installCmd: "pkg install -y zip unzip",
    checkCmd: "command -v zip >/dev/null 2>&1 && command -v unzip >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y zip unzip",
    estimateSec: 15,
    order: 3,
  },
  {
    id: "git",
    name: "Git",
    nameEn: "Git",
    installCmd: "pkg install -y git",
    checkCmd: "command -v git >/dev/null 2>&1 && git --version",
    removeCmd: "pkg uninstall -y git",
    estimateSec: 30,
    order: 4,
  },
  {
    id: "openjdk-17",
    name: "Java Development Kit (OpenJDK)",
    nameEn: "Java Development Kit (OpenJDK)",
    // Termux: openjdk-17 или openjdk-21. Ставим оба кандидатов; check — реальный java.
    installCmd: `set +e
pkg install -y openjdk-21 2>&1 || pkg install -y openjdk-17 2>&1 || pkg install -y openjdk-17-jdk 2>&1
if command -v java >/dev/null 2>&1; then
  java -version 2>&1 | head -1
  echo JAVA_OK
  exit 0
fi
echo JAVA_FAIL
exit 1`,
    checkCmd: "command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y openjdk-21 openjdk-17 openjdk-17-jdk 2>/dev/null; true",
    estimateSec: 120,
    order: 5,
  },
  {
    id: "build-essential",
    name: "Build Essential",
    nameEn: "Build Essential",
    installCmd: "pkg install -y build-essential",
    checkCmd: "command -v gcc >/dev/null 2>&1 || dpkg -s build-essential >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y build-essential",
    estimateSec: 90,
    order: 6,
  },
  {
    id: "clang",
    name: "Clang",
    nameEn: "Clang",
    installCmd: "pkg install -y clang",
    checkCmd: "command -v clang >/dev/null 2>&1 && clang --version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y clang",
    estimateSec: 60,
    order: 7,
  },
  {
    id: "make",
    name: "Make",
    nameEn: "Make",
    installCmd: "pkg install -y make",
    checkCmd: "command -v make >/dev/null 2>&1 && make --version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y make",
    estimateSec: 20,
    order: 8,
  },
  {
    id: "cmake",
    name: "CMake",
    nameEn: "CMake",
    installCmd: "pkg install -y cmake",
    checkCmd: "command -v cmake >/dev/null 2>&1 && cmake --version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y cmake",
    estimateSec: 40,
    order: 9,
  },
  {
    id: "android-sdk",
    name: "Android SDK",
    nameEn: "Android SDK",
    // Нет пакета android-sdk в Termux apt. Ставим android-tools + aapt и собираем $PREFIX/opt/android-sdk.
    installCmd: `set +e
pkg update -y >/dev/null 2>&1
pkg install -y android-tools aapt aapt2 apksigner d8 unzip wget curl 2>&1
pkg install -y android-tools aapt aapt2 unzip wget curl 2>&1
mkdir -p "$PREFIX/opt/android-sdk/platform-tools" "$PREFIX/opt/android-sdk/build-tools/termux" "$PREFIX/tmp"
for b in adb fastboot aapt aapt2 apksigner d8; do
  if command -v "$b" >/dev/null 2>&1; then
    ln -sf "$(command -v "$b")" "$PREFIX/opt/android-sdk/platform-tools/$b" 2>/dev/null
    ln -sf "$(command -v "$b")" "$PREFIX/opt/android-sdk/build-tools/termux/$b" 2>/dev/null
  fi
done
if command -v adb >/dev/null 2>&1 || command -v aapt2 >/dev/null 2>&1 || command -v aapt >/dev/null 2>&1 || [ -x "$PREFIX/opt/android-sdk/platform-tools/adb" ]; then
  echo SDK_OK
  exit 0
fi
echo "SDK_FAIL: android-tools/aapt not available"
exit 1`,
    checkCmd: `(command -v adb >/dev/null 2>&1 || command -v aapt2 >/dev/null 2>&1 || command -v aapt >/dev/null 2>&1 || [ -x "$PREFIX/opt/android-sdk/platform-tools/adb" ] || [ -x "$PREFIX/opt/android-sdk/build-tools/termux/aapt2" ] || [ -x "$PREFIX/opt/android-sdk/build-tools/termux/aapt" ])`,
    removeCmd: `pkg uninstall -y android-tools aapt aapt2 apksigner d8 2>/dev/null; rm -rf "$PREFIX/opt/android-sdk"`,
    estimateSec: 180,
    order: 10,
  },
  {
    id: "android-ndk",
    name: "Android NDK",
    nameEn: "Android NDK",
    // Актуальный aarch64 NDK: lzhiyong r29 (tar.xz ~344MB), не старые zip r27.
    installCmd: `set +e
pkg install -y wget curl tar xz-utils 2>&1 | tail -5
PREFIX="\${PREFIX:-/data/data/com.termux/files/usr}"
if [ -f "$PREFIX/opt/android-ndk/ndk-build" ] || [ -f "$PREFIX/opt/android-ndk/build/ndk-build" ]; then
  echo NDK_ALREADY
  exit 0
fi
ARCH=$(uname -m)
if ! echo "$ARCH" | grep -qiE 'aarch64|arm64'; then
  echo "NDK_FAIL: need aarch64 host, got $ARCH"
  exit 1
fi
AIB_TMP="/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp"
mkdir -p "$PREFIX/opt" "$AIB_TMP"
TMPXZ="$AIB_TMP/android-ndk-r29-aarch64.tar.xz"
TMPDIR="$AIB_TMP/ndk-extract"
EXPECT_SHA="02e10e4ddfe8deaeb0bd0cf29d04c981ed5bc8a5d6b560ebb9e7661f472d684b"
EXPECT_MIN=300000000
# Прямой URL + зеркала (мобильные сети часто режут github releases)
URLS="
https://github.com/lzhiyong/termux-ndk/releases/download/android-ndk/android-ndk-r29-aarch64.tar.xz
https://ghfast.top/https://github.com/lzhiyong/termux-ndk/releases/download/android-ndk/android-ndk-r29-aarch64.tar.xz
https://mirror.ghproxy.com/https://github.com/lzhiyong/termux-ndk/releases/download/android-ndk/android-ndk-r29-aarch64.tar.xz
https://gh-proxy.com/https://github.com/lzhiyong/termux-ndk/releases/download/android-ndk/android-ndk-r29-aarch64.tar.xz
https://ghproxy.net/https://github.com/lzhiyong/termux-ndk/releases/download/android-ndk/android-ndk-r29-aarch64.tar.xz
"
OK=0
for U in $URLS; do
  [ -z "$U" ] && continue
  echo "NDK_DL $U"
  rm -f "$TMPXZ"
  # curl: follow redirects, resume, long timeout (mobile)
  curl -fL --connect-timeout 20 --retry 3 --retry-delay 2 --max-time 1800 \
    -C - -o "$TMPXZ" "$U"
  EC=$?
  SZ=$(stat -c%s "$TMPXZ" 2>/dev/null || echo 0)
  echo "NDK_CURL_EC=$EC NDK_SIZE=$SZ"
  if [ "$SZ" -lt "$EXPECT_MIN" ]; then
    echo "NDK_TOO_SMALL, try wget"
    rm -f "$TMPXZ"
    wget -c --timeout=60 --tries=3 -O "$TMPXZ" "$U"
    SZ=$(stat -c%s "$TMPXZ" 2>/dev/null || echo 0)
    echo "NDK_WGET_SIZE=$SZ"
  fi
  if [ "$SZ" -lt "$EXPECT_MIN" ]; then
    echo "NDK_BAD_SIZE skip"
    rm -f "$TMPXZ"
    continue
  fi
  # SHA256 если есть sha256sum
  if command -v sha256sum >/dev/null 2>&1; then
    GOT=$(sha256sum "$TMPXZ" | awk '{print $1}')
    echo "NDK_SHA got=$GOT"
    if [ "$GOT" != "$EXPECT_SHA" ]; then
      echo "NDK_SHA_MISMATCH expected=$EXPECT_SHA"
      rm -f "$TMPXZ"
      continue
    fi
  fi
  rm -rf "$TMPDIR" "$PREFIX/opt/android-ndk"
  mkdir -p "$TMPDIR"
  echo "NDK_EXTRACT…"
  tar -xJf "$TMPXZ" -C "$TMPDIR" 2>&1 | tail -5
  ROOT=$(find "$TMPDIR" -name ndk-build -type f 2>/dev/null | head -1)
  if [ -z "$ROOT" ]; then
    echo "NDK_NO_NDK_BUILD"
    rm -rf "$TMPDIR"
    continue
  fi
  ROOT=$(dirname "$ROOT")
  if [ "$(basename "$ROOT")" = "build" ]; then ROOT=$(dirname "$ROOT"); fi
  mv "$ROOT" "$PREFIX/opt/android-ndk"
  chmod -R u+x "$PREFIX/opt/android-ndk" 2>/dev/null
  # prebuilt host: некоторые сборки кладут linux-aarch64
  if [ -d "$PREFIX/opt/android-ndk/toolchains/llvm/prebuilt" ]; then
    ls "$PREFIX/opt/android-ndk/toolchains/llvm/prebuilt" 2>/dev/null | head -5
  fi
  OK=1
  echo "NDK_OK path=$PREFIX/opt/android-ndk"
  break
done
rm -f "$TMPXZ"
rm -rf "$TMPDIR"
if [ "$OK" = 1 ]; then
  exit 0
fi
echo "NDK_FAIL: download/extract failed. Check mobile GitHub access or try Wi‑Fi."
exit 1`,
    checkCmd: `([ -f "$PREFIX/opt/android-ndk/ndk-build" ] || [ -f "$PREFIX/opt/android-ndk/build/ndk-build" ])`,
    removeCmd: `rm -rf "$PREFIX/opt/android-ndk" "$PREFIX/opt/android-ndk-r29" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/ndk" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/ndk-extract" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/android-ndk-r29-aarch64.tar.xz"`,
    estimateSec: 600,
    order: 11,
  },
  {
    id: "gradle",
    name: "Gradle",
    nameEn: "Gradle",
    installCmd: `set +e
pkg install -y gradle 2>&1
if command -v gradle >/dev/null 2>&1; then
  gradle --version 2>&1 | head -2
  echo GRADLE_OK
  exit 0
fi
# Fallback: official binary (works on aarch64 with OpenJDK)
pkg install -y wget unzip openjdk-17 openjdk-21 2>/dev/null
VER=8.11.1
DEST="$PREFIX/opt/gradle"
TMP="/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/gradle.zip"
mkdir -p "$PREFIX/opt" "$(dirname "$TMP")"
rm -f "$TMP"
URL="https://services.gradle.org/distributions/gradle-\${VER}-bin.zip"
echo "GRADLE_DL $URL"
wget --timeout=180 --tries=2 -O "$TMP" "$URL" 2>&1 | tail -5 || curl -fL --connect-timeout 30 --max-time 600 -o "$TMP" "$URL"
SZ=$(stat -c%s "$TMP" 2>/dev/null || echo 0)
if [ "$SZ" -gt 10000000 ]; then
  rm -rf "$DEST"
  unzip -q -o "$TMP" -d "$PREFIX/opt"
  mv "$PREFIX/opt/gradle-\${VER}" "$DEST" 2>/dev/null || true
  ln -sf "$DEST/bin/gradle" "$PREFIX/bin/gradle"
  rm -f "$TMP"
  if command -v gradle >/dev/null 2>&1 || [ -x "$DEST/bin/gradle" ]; then
    echo GRADLE_OK
    exit 0
  fi
fi
echo GRADLE_FAIL
exit 1`,
    checkCmd: 'command -v gradle >/dev/null 2>&1 || [ -x "$PREFIX/opt/gradle/bin/gradle" ]',
    removeCmd: `pkg uninstall -y gradle 2>/dev/null; rm -rf "$PREFIX/opt/gradle"; rm -f "$PREFIX/bin/gradle"`,
    estimateSec: 120,
    order: 12,
  },
  {
    id: "ant",
    name: "Apache Ant",
    nameEn: "Apache Ant",
    installCmd: "pkg install -y ant",
    checkCmd: "command -v ant >/dev/null 2>&1 && ant -version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y ant",
    estimateSec: 40,
    order: 13,
  },
  {
    id: "maven",
    name: "Maven",
    nameEn: "Maven",
    installCmd: "pkg install -y maven",
    checkCmd: "command -v mvn >/dev/null 2>&1 && mvn -version 2>&1 | head -1",
    removeCmd: "pkg uninstall -y maven",
    estimateSec: 60,
    order: 14,
  },
  {
    id: "nano",
    name: "Nano",
    nameEn: "Nano",
    installCmd: "pkg install -y nano",
    checkCmd: "command -v nano >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y nano",
    estimateSec: 10,
    order: 15,
  },
  {
    id: "vim",
    name: "Vim",
    nameEn: "Vim",
    installCmd: "pkg install -y vim",
    checkCmd: "command -v vim >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y vim",
    estimateSec: 20,
    order: 16,
  },

  {
    id: "nodejs",
    name: "Node.js",
    nameEn: "Node.js",
    installCmd: `set +e
pkg install -y nodejs-lts 2>&1 || pkg install -y nodejs 2>&1
if command -v node >/dev/null 2>&1; then
  node -v 2>&1 | head -1
  echo NODE_OK
  exit 0
fi
echo NODE_FAIL
exit 1`,
    checkCmd: "command -v node >/dev/null 2>&1 && node -v >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y nodejs-lts nodejs 2>/dev/null; true",
    estimateSec: 90,
    order: 17,
  },
  {
    id: "npm",
    name: "npm",
    nameEn: "npm",
    installCmd: `set +e
# npm обычно идёт с nodejs; при отсутствии — доустановка
pkg install -y nodejs-lts 2>&1 || pkg install -y nodejs 2>&1
if command -v npm >/dev/null 2>&1; then
  npm -v 2>&1 | head -1
  echo NPM_OK
  exit 0
fi
echo NPM_FAIL
exit 1`,
    checkCmd: "command -v npm >/dev/null 2>&1 && npm -v >/dev/null 2>&1",
    removeCmd: "true",
    estimateSec: 60,
    order: 18,
  },
  {
    id: "pnpm",
    name: "pnpm",
    nameEn: "pnpm",
    installCmd: `set +e
pkg install -y nodejs-lts 2>&1 || pkg install -y nodejs 2>&1
if ! command -v npm >/dev/null 2>&1; then
  echo NPM_MISSING
  exit 1
fi
npm install -g pnpm 2>&1
if command -v pnpm >/dev/null 2>&1; then
  pnpm -v 2>&1 | head -1
  echo PNPM_OK
  exit 0
fi
# fallback corepack
command -v corepack >/dev/null 2>&1 && corepack enable && corepack prepare pnpm@9.15.0 --activate 2>&1
if command -v pnpm >/dev/null 2>&1; then
  pnpm -v 2>&1 | head -1
  echo PNPM_OK
  exit 0
fi
echo PNPM_FAIL
exit 1`,
    checkCmd: "command -v pnpm >/dev/null 2>&1 && pnpm -v >/dev/null 2>&1",
    removeCmd: "npm uninstall -g pnpm 2>/dev/null; true",
    estimateSec: 90,
    order: 19,
  },
  {
    id: "kotlin",
    name: "Kotlin",
    nameEn: "Kotlin",
    installCmd: `set +e
pkg install -y kotlin 2>&1 || pkg install -y kotlin-compiler 2>&1
if command -v kotlinc >/dev/null 2>&1; then
  kotlinc -version 2>&1 | head -1
  echo KOTLIN_OK
  exit 0
fi
if command -v kotlin >/dev/null 2>&1; then
  kotlin -version 2>&1 | head -1
  echo KOTLIN_OK
  exit 0
fi
echo KOTLIN_FAIL
exit 1`,
    checkCmd: "command -v kotlinc >/dev/null 2>&1 || command -v kotlin >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y kotlin kotlin-compiler 2>/dev/null; true",
    estimateSec: 60,
    order: 20,
  },
  {
    id: "python",
    name: "Python",
    nameEn: "Python",
    installCmd: "pkg install -y python",
    checkCmd: "command -v python >/dev/null 2>&1 || command -v python3 >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y python",
    estimateSec: 60,
    order: 21,
  },
  {
    id: "termux-api",
    name: "Termux API",
    nameEn: "Termux API",
    installCmd: "pkg install -y termux-api",
    checkCmd: "command -v termux-battery-status >/dev/null 2>&1 || dpkg -s termux-api >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y termux-api",
    estimateSec: 30,
    order: 22,
  },
  {
    id: "aapt2",
    name: "AAPT / AAPT2",
    nameEn: "AAPT / AAPT2",
    installCmd: `set +e
# aapt/aapt2 + android-tools (часто даёт zipalign рядом с build-tools)
pkg install -y aapt aapt2 2>&1
pkg install -y android-tools 2>&1 || true
if command -v aapt2 >/dev/null 2>&1 || command -v aapt >/dev/null 2>&1; then
  (aapt2 version 2>&1 || aapt version 2>&1) | head -1
  echo AAPT_OK
  exit 0
fi
echo AAPT_FAIL
exit 1`,
    checkCmd: "command -v aapt2 >/dev/null 2>&1 || command -v aapt >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y aapt aapt2 2>/dev/null; true",
    estimateSec: 40,
    order: 23,
  },
  {
    id: "zipalign",
    name: "Zipalign",
    nameEn: "Zipalign",
    installCmd: `set +e
# zipalign обычно в android-tools или build-tools SDK; ставим оба пути
pkg install -y android-tools 2>&1 || true
pkg install -y aapt aapt2 2>&1 || true
if command -v zipalign >/dev/null 2>&1; then
  zipalign 2>&1 | head -1 || true
  echo ZIPALIGN_OK
  exit 0
fi
# иногда только в SDK build-tools
if find "$PREFIX" -name zipalign -type f 2>/dev/null | head -1 | grep -q .; then
  echo ZIPALIGN_OK
  exit 0
fi
if [ -n "$ANDROID_HOME" ] && find "$ANDROID_HOME/build-tools" -name zipalign -type f 2>/dev/null | head -1 | grep -q .; then
  echo ZIPALIGN_OK
  exit 0
fi
echo ZIPALIGN_FAIL
exit 1`,
    checkCmd: 'command -v zipalign >/dev/null 2>&1 || find "$PREFIX" -name zipalign -type f 2>/dev/null | head -1 | grep -q . || ([ -n "$ANDROID_HOME" ] && find "$ANDROID_HOME/build-tools" -name zipalign -type f 2>/dev/null | head -1 | grep -q .)',
    removeCmd: "true",
    estimateSec: 40,
    order: 24,
  },
  {
    id: "apksigner",
    name: "Apksigner",
    nameEn: "Apksigner",
    installCmd: `set +e
pkg install -y apksigner 2>&1 || pkg install -y android-tools 2>&1
if command -v apksigner >/dev/null 2>&1; then
  apksigner --version 2>&1 | head -1
  echo APKSIGNER_OK
  exit 0
fi
# иногда лежит только в SDK path
if find "$PREFIX" -name apksigner -type f 2>/dev/null | head -1 | grep -q .; then
  echo APKSIGNER_OK
  exit 0
fi
echo APKSIGNER_FAIL
exit 1`,
    checkCmd: "command -v apksigner >/dev/null 2>&1 || find \"$PREFIX\" -name apksigner -type f 2>/dev/null | head -1 | grep -q .",
    removeCmd: "pkg uninstall -y apksigner 2>/dev/null; true",
    estimateSec: 40,
    order: 25,
  },
  {
    id: "platform-tools",
    name: "Platform-tools (adb)",
    nameEn: "Platform-tools (adb)",
    installCmd: `set +e
pkg install -y android-tools 2>&1
if command -v adb >/dev/null 2>&1; then
  adb version 2>&1 | head -1
  echo ADB_OK
  exit 0
fi
echo ADB_FAIL
exit 1`,
    checkCmd: "command -v adb >/dev/null 2>&1 && adb version >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y android-tools 2>/dev/null; true",
    estimateSec: 40,
    order: 26,
  },
  {
    id: "which",
    name: "which",
    nameEn: "which",
    // Пакета which на Termux часто нет; pkg падает на mirrors —
    // пробуем pkg/apt, иначе shim через command -v.
    installCmd: `set +e
export DEBIAN_FRONTEND=noninteractive
PREFIX="\${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="\$PREFIX/bin:\$PATH"
if command -v which >/dev/null 2>&1; then
  echo WHICH_OK already
  which which 2>&1 | head -1
  exit 0
fi
mkdir -p "\$PREFIX/etc/termux" "\$PREFIX/etc/apt"
printf '%s\\n' 'https://packages.termux.dev/apt/' > "\$PREFIX/etc/termux/chosen_mirrors"
printf '%s\\n' 'deb https://packages.termux.dev/apt/termux-main stable main' > "\$PREFIX/etc/apt/sources.list"
apt-get update -y 2>&1 | tail -15
pkg update -y 2>&1 | tail -10
pkg install -y which 2>&1 | tail -20
apt-get install -y which 2>&1 | tail -15
pkg install -y debianutils 2>&1 | tail -10
if command -v which >/dev/null 2>&1; then
  which which 2>&1 | head -1
  echo WHICH_OK
  exit 0
fi
mkdir -p "\$PREFIX/bin"
cat > "\$PREFIX/bin/which" << 'AIB_WHICH'
#!/data/data/com.termux/files/usr/bin/sh
exec command -v "$@"
AIB_WHICH
chmod 755 "\$PREFIX/bin/which"
if command -v which >/dev/null 2>&1; then
  echo WHICH_OK shim
  exit 0
fi
echo WHICH_FAIL
exit 1`,
    checkCmd: "command -v which >/dev/null 2>&1",
    removeCmd: `pkg uninstall -y which 2>/dev/null; rm -f "\$PREFIX/bin/which"; true`,
    estimateSec: 45,
    order: 27,
  },
  {
    id: "ninja",
    name: "Ninja (CMake/native)",
    nameEn: "Ninja (CMake/native)",
    installCmd: `set +e
export DEBIAN_FRONTEND=noninteractive
PREFIX="\${PREFIX:-/data/data/com.termux/files/usr}"
export PATH="\$PREFIX/bin:\$PATH"
if command -v ninja >/dev/null 2>&1; then
  ninja --version 2>&1 | head -1
  echo NINJA_OK already
  exit 0
fi
mkdir -p "\$PREFIX/etc/termux" "\$PREFIX/etc/apt" "\$PREFIX/tmp"
printf '%s\\n' 'https://packages.termux.dev/apt/' > "\$PREFIX/etc/termux/chosen_mirrors"
printf '%s\\n' 'deb https://packages.termux.dev/apt/termux-main stable main' > "\$PREFIX/etc/apt/sources.list"
apt-get update -y 2>&1 | tail -25
pkg update -y 2>&1 | tail -15
for try in 1 2 3; do
  echo "NINJA_TRY_\$try"
  pkg install -y ninja 2>&1 | tail -25
  if command -v ninja >/dev/null 2>&1; then
    ninja --version 2>&1 | head -1
    echo NINJA_OK
    exit 0
  fi
  apt-get install -y ninja 2>&1 | tail -20
  if command -v ninja >/dev/null 2>&1; then
    ninja --version 2>&1 | head -1
    echo NINJA_OK
    exit 0
  fi
  pkg install -y ninja-build 2>&1 | tail -15
  if command -v ninja >/dev/null 2>&1; then
    ninja --version 2>&1 | head -1
    echo NINJA_OK
    exit 0
  fi
  sleep 2
done
# Официальные release ninja — в основном x86_64; на aarch64 нужен pkg/apt.
if command -v ninja >/dev/null 2>&1; then
  ninja --version 2>&1 | head -1
  echo NINJA_OK
  exit 0
fi
echo NINJA_FAIL
echo "pkg/apt could not install ninja (mirror/network)."
echo "In Termux run: pkg update -y && pkg install -y ninja"
exit 1`,
    checkCmd: "command -v ninja >/dev/null 2>&1 && ninja --version >/dev/null 2>&1",
    removeCmd: `pkg uninstall -y ninja ninja-build 2>/dev/null; rm -f "\$PREFIX/bin/ninja"; true`,
    estimateSec: 120,
    order: 28,
  },
  {
    id: "sdk-cmdline-tools",
    name: "SDK cmdline-tools (sdkmanager)",
    nameEn: "SDK cmdline-tools (sdkmanager)",
    installCmd: `set +e
SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-\$PREFIX/opt/android-sdk}}"
mkdir -p "\$SDK" "\$PREFIX/tmp" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp"
# уже есть?
if [ -x "\$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
  "\$SDK/cmdline-tools/latest/bin/sdkmanager" --version 2>&1 | head -1
  echo CMDLINE_OK
  exit 0
fi
pkg install -y wget curl unzip openjdk-17 2>&1 | tail -5
TMP="/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/cmdtools.zip"
rm -f "\$TMP"
# Google official (host=linux zip works with Java sdkmanager on aarch64 Termux)
URLS="
https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
https://dl.google.com/android/repository/commandlinetools-linux-10406996_latest.zip
"
OK=0
for URL in \$URLS; do
  echo "CMDLINE_DL \$URL"
  wget --timeout=180 --tries=3 -O "\$TMP" "\$URL" 2>&1 | tail -4 || \\
    curl -fL --connect-timeout 30 --max-time 600 -o "\$TMP" "\$URL" 2>&1 | tail -4
  SZ=\$(stat -c%s "\$TMP" 2>/dev/null || echo 0)
  if [ "\$SZ" -lt 1000000 ]; then
    echo "CMDLINE_BAD_SIZE \$SZ"
    rm -f "\$TMP"
    continue
  fi
  rm -rf "\$SDK/cmdline-tools/latest" "\$SDK/cmdline-tools/_tmp"
  mkdir -p "\$SDK/cmdline-tools/_tmp"
  unzip -q -o "\$TMP" -d "\$SDK/cmdline-tools/_tmp" 2>&1 | tail -3
  # zip contains cmdline-tools/bin → move to latest/
  if [ -d "\$SDK/cmdline-tools/_tmp/cmdline-tools" ]; then
    mv "\$SDK/cmdline-tools/_tmp/cmdline-tools" "\$SDK/cmdline-tools/latest"
  elif [ -d "\$SDK/cmdline-tools/_tmp/bin" ]; then
    mkdir -p "\$SDK/cmdline-tools/latest"
    mv "\$SDK/cmdline-tools/_tmp"/* "\$SDK/cmdline-tools/latest/" 2>/dev/null || true
  else
    INNER=\$(find "\$SDK/cmdline-tools/_tmp" -type d -name bin 2>/dev/null | head -1)
    if [ -n "\$INNER" ]; then
      PARENT=\$(dirname "\$INNER")
      rm -rf "\$SDK/cmdline-tools/latest"
      mv "\$PARENT" "\$SDK/cmdline-tools/latest"
    fi
  fi
  rm -rf "\$SDK/cmdline-tools/_tmp" "\$TMP"
  if [ -x "\$SDK/cmdline-tools/latest/bin/sdkmanager" ]; then
    mkdir -p "\$SDK/licenses"
    printf '%s\\n' '24333f8a63b6825ea9c5514f83c2829b004d1fee' > "\$SDK/licenses/android-sdk-license"
    printf '%s\\n' '84831b9409646a918e30573bab4c9c91346d8abd' > "\$SDK/licenses/android-sdk-preview-license"
    "\$SDK/cmdline-tools/latest/bin/sdkmanager" --sdk_root="\$SDK" --version 2>&1 | head -2
    OK=1
    echo CMDLINE_OK
    break
  fi
done
if [ "\$OK" = 1 ]; then exit 0; fi
echo CMDLINE_FAIL
exit 1`,
    checkCmd: `[ -x "\${ANDROID_HOME:-\$PREFIX/opt/android-sdk}/cmdline-tools/latest/bin/sdkmanager" ] || [ -x "\$PREFIX/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager" ]`,
    removeCmd: `rm -rf "\$PREFIX/opt/android-sdk/cmdline-tools" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/cmdtools.zip"`,
    estimateSec: 180,
    order: 29,
  },
  {
    id: "android-platform-34",
    name: "Android Platform 34",
    nameEn: "Android Platform 34",
    installCmd: `set +e
SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-\$PREFIX/opt/android-sdk}}"
mkdir -p "\$SDK/platforms" "\$SDK/licenses"
printf '%s\\n' '24333f8a63b6825ea9c5514f83c2829b004d1fee' > "\$SDK/licenses/android-sdk-license"
printf '%s\\n' '84831b9409646a918e30573bab4c9c91346d8abd' > "\$SDK/licenses/android-sdk-preview-license"
if [ -f "\$SDK/platforms/android-34/android.jar" ]; then
  echo PLATFORM34_OK
  exit 0
fi
SM=""
for c in "\$SDK/cmdline-tools/latest/bin/sdkmanager" "\$PREFIX/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager" "\$PREFIX/bin/sdkmanager"; do
  [ -x "\$c" ] && SM="\$c" && break
done
if [ -n "\$SM" ]; then
  export JAVA_HOME="\${JAVA_HOME:-\$PREFIX/lib/jvm/java-17-openjdk}"
  export PATH="\$JAVA_HOME/bin:\$PATH"
  yes 2>/dev/null | "\$SM" --sdk_root="\$SDK" "platforms;android-34" 2>&1 | tail -20
  if [ -f "\$SDK/platforms/android-34/android.jar" ]; then
    echo PLATFORM34_OK
    exit 0
  fi
fi
# fallback: Google repository platform zip (android-34)
pkg install -y wget curl unzip 2>&1 | tail -3
TMP="/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/platform-34.zip"
rm -f "\$TMP"
URL="https://dl.google.com/android/repository/platform-34-ext7_r03.zip"
echo "PLATFORM34_DL \$URL"
wget --timeout=180 --tries=3 -O "\$TMP" "\$URL" 2>&1 | tail -4 || \\
  curl -fL --connect-timeout 30 --max-time 600 -o "\$TMP" "\$URL" 2>&1 | tail -4
SZ=\$(stat -c%s "\$TMP" 2>/dev/null || echo 0)
if [ "\$SZ" -gt 1000000 ]; then
  rm -rf "\$SDK/platforms/android-34"
  mkdir -p "\$SDK/platforms"
  unzip -q -o "\$TMP" -d "\$SDK/platforms" 2>&1 | tail -3
  # zip may extract as android-34 or platforms/android-34
  if [ ! -f "\$SDK/platforms/android-34/android.jar" ]; then
    FOUND=\$(find "\$SDK/platforms" -name android.jar 2>/dev/null | head -1)
    if [ -n "\$FOUND" ]; then
      DIR=\$(dirname "\$FOUND")
      rm -rf "\$SDK/platforms/android-34"
      mv "\$DIR" "\$SDK/platforms/android-34"
    fi
  fi
  rm -f "\$TMP"
fi
if [ -f "\$SDK/platforms/android-34/android.jar" ]; then
  echo PLATFORM34_OK
  exit 0
fi
echo PLATFORM34_FAIL
echo "Install SDK cmdline-tools first, then retry Platform 34"
exit 1`,
    checkCmd: `[ -f "\${ANDROID_HOME:-\$PREFIX/opt/android-sdk}/platforms/android-34/android.jar" ] || [ -f "\$PREFIX/opt/android-sdk/platforms/android-34/android.jar" ]`,
    removeCmd: `rm -rf "\$PREFIX/opt/android-sdk/platforms/android-34" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/platform-34.zip"`,
    estimateSec: 180,
    order: 30,
  },
  {
    id: "android-platform-35",
    name: "Android Platform 35",
    nameEn: "Android Platform 35",
    installCmd: `set +e
SDK="\${ANDROID_HOME:-\${ANDROID_SDK_ROOT:-\$PREFIX/opt/android-sdk}}"
mkdir -p "\$SDK/platforms" "\$SDK/licenses"
printf '%s\\n' '24333f8a63b6825ea9c5514f83c2829b004d1fee' > "\$SDK/licenses/android-sdk-license"
printf '%s\\n' '84831b9409646a918e30573bab4c9c91346d8abd' > "\$SDK/licenses/android-sdk-preview-license"
if [ -f "\$SDK/platforms/android-35/android.jar" ]; then
  echo PLATFORM35_OK
  exit 0
fi
SM=""
for c in "\$SDK/cmdline-tools/latest/bin/sdkmanager" "\$PREFIX/opt/android-sdk/cmdline-tools/latest/bin/sdkmanager" "\$PREFIX/bin/sdkmanager"; do
  [ -x "\$c" ] && SM="\$c" && break
done
if [ -n "\$SM" ]; then
  export JAVA_HOME="\${JAVA_HOME:-\$PREFIX/lib/jvm/java-17-openjdk}"
  export PATH="\$JAVA_HOME/bin:\$PATH"
  yes 2>/dev/null | "\$SM" --sdk_root="\$SDK" "platforms;android-35" 2>&1 | tail -20
  if [ -f "\$SDK/platforms/android-35/android.jar" ]; then
    echo PLATFORM35_OK
    exit 0
  fi
fi
pkg install -y wget curl unzip 2>&1 | tail -3
TMP="/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/platform-35.zip"
rm -f "\$TMP"
URL="https://dl.google.com/android/repository/platform-35_r01.zip"
echo "PLATFORM35_DL \$URL"
wget --timeout=180 --tries=3 -O "\$TMP" "\$URL" 2>&1 | tail -4 || \\
  curl -fL --connect-timeout 30 --max-time 600 -o "\$TMP" "\$URL" 2>&1 | tail -4
SZ=\$(stat -c%s "\$TMP" 2>/dev/null || echo 0)
if [ "\$SZ" -gt 1000000 ]; then
  rm -rf "\$SDK/platforms/android-35"
  mkdir -p "\$SDK/platforms"
  unzip -q -o "\$TMP" -d "\$SDK/platforms" 2>&1 | tail -3
  if [ ! -f "\$SDK/platforms/android-35/android.jar" ]; then
    FOUND=\$(find "\$SDK/platforms" -path "*android-35*" -name android.jar 2>/dev/null | head -1)
    if [ -n "\$FOUND" ]; then
      DIR=\$(dirname "\$FOUND")
      rm -rf "\$SDK/platforms/android-35"
      mv "\$DIR" "\$SDK/platforms/android-35"
    fi
  fi
  rm -f "\$TMP"
fi
if [ -f "\$SDK/platforms/android-35/android.jar" ]; then
  echo PLATFORM35_OK
  exit 0
fi
echo PLATFORM35_FAIL
echo "Install SDK cmdline-tools first, then retry Platform 35"
exit 1`,
    checkCmd: `[ -f "\${ANDROID_HOME:-\$PREFIX/opt/android-sdk}/platforms/android-35/android.jar" ] || [ -f "\$PREFIX/opt/android-sdk/platforms/android-35/android.jar" ]`,
    removeCmd: `rm -rf "\$PREFIX/opt/android-sdk/platforms/android-35" "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/platform-35.zip"`,
    estimateSec: 180,
    order: 31,
  },

];

const STORAGE_KEY = "aibuilder.compile_packages.installed.v1";

export type PackageStatus = "unknown" | "missing" | "installed" | "installing" | "removing" | "error" | "blocked" | "checking";

export interface PackageRuntimeState {
  status: PackageStatus;
  progress: number; // 0–100
  detail?: string;
  lastError?: string;
}

const DEFAULT_STATE: PackageRuntimeState = {
  status: "unknown",
  progress: 0,
};

/** Долгий таймаут для pkg install (сеть + распаковка). */
const INSTALL_TIMEOUT_MS = 900_000; // 15 мин
const CHECK_TIMEOUT_MS = 25_000;
const REMOVE_TIMEOUT_MS = 180_000;
const UPDATE_TIMEOUT_MS = 300_000;

/** Небольшая пауза между командами — снижает гонки на медленных/бесплатных каналах. */
function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadInstalledMap(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

export async function saveInstalledMap(map: Record<string, boolean>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    persistentLogger.add("warn", "CompilePackages", `saveInstalledMap failed: ${e}`);
  }
}

/**
 * Проверка одного пакета в Termux.
 * Возвращает true если checkCmd exit 0.
 */
export async function verifyPackageInstalled(def: CompilePackageDef): Promise<boolean> {
  try {
    const r = await runShellCommand(withCheckEnvironment(def.checkCmd), { timeoutMs: CHECK_TIMEOUT_MS });
    return r.exitCode === 0 && !r.timedOut;
  } catch {
    return false;
  }
}

/**
 * Массовая проверка всех пакетов (после открытия меню / после install).
 */
export async function verifyAllPackages(
  onUpdate?: (id: CompilePkgId, installed: boolean) => void
): Promise<Record<CompilePkgId, boolean>> {
  const result = {} as Record<CompilePkgId, boolean>;
  const cached = await loadInstalledMap();

  for (const def of COMPILE_PACKAGES) {
    // Быстрый путь: если в кэше false и нет сети — всё равно проверяем
    let ok = false;
    try {
      ok = await verifyPackageInstalled(def);
    } catch {
      ok = !!cached[def.id];
    }
    result[def.id] = ok;
    onUpdate?.(def.id, ok);
    await delay(80); // не долбим Termux пачкой
  }

  await saveInstalledMap(result as Record<string, boolean>);
  return result;
}

/**
 * Установка одного пакета с прогрессом.
 * Этапы: 5% prep → 15% update (опц.) → 20–90% install (таймер) → 95% verify → 100%.
 */
export async function installCompilePackage(
  def: CompilePackageDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `CompilePkg:${def.id}`;

  const tick = (p: number, detail: string) => {
    if (shouldAbort?.()) return;
    onProgress(Math.min(99, Math.max(0, p)), detail);
  };

  try {
    tick(3, "Подготовка…");
    await delay(200);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    // Зеркала + update (критично: без chosen_mirrors pkg даёт exit 100 /
    // «Testing the available mirrors» + exit 1)
    tick(5, "Настройка зеркал Termux…");
    try {
      await runShellCommand(
        withInstallerEnvironment(
          'mkdir -p "$PREFIX/etc/termux" "$PREFIX/etc/apt"; ' +
          'printf "%s\\n" "https://packages.termux.dev/apt/" > "$PREFIX/etc/termux/chosen_mirrors"; ' +
          'printf "%s\\n" "deb https://packages.termux.dev/apt/termux-main stable main" > "$PREFIX/etc/apt/sources.list"; ' +
          'echo "mirrors=$(cat $PREFIX/etc/termux/chosen_mirrors 2>/dev/null | head -1)"; ' +
          'export DEBIAN_FRONTEND=noninteractive; ' +
          'apt-get update -y 2>&1 | tail -12; ' +
          'pkg update -y 2>&1 | tail -12'
        ),
        { timeoutMs: UPDATE_TIMEOUT_MS },
      );
    } catch (e) {
      persistentLogger.add("warn", tag, `pkg update soft-fail: ${e}`);
    }
    await delay(300);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    tick(15, `Установка ${def.name}…`);

    // Симуляция прогресса по времени, пока идёт install
    const est = Math.max(20, def.estimateSec);
    const start = Date.now();
    let installDone = false;
    let installResult: TermuxCommandResult | null = null;
    let installError: string | undefined;

    // Прогресс честный: таймер только до 70%. 90–100% — только после реального exit+verify.
    // Раньше кривая доходила до 88% «вслепую», а при быстрой установке индикатор врал.
    const progressTimer = setInterval(() => {
      if (installDone || shouldAbort?.()) return;
      const elapsed = (Date.now() - start) / 1000;
      const ratio = Math.min(1, elapsed / est);
      const p = 15 + Math.floor(55 * (1 - Math.exp(-2.2 * ratio))); // max ~70%
      tick(p, `Установка ${def.name}… ${Math.round(elapsed)}с`);
    }, 800);

    try {
      installResult = await runShellCommand(withInstallerEnvironment(def.installCmd), {
        timeoutMs: INSTALL_TIMEOUT_MS,
        isBuild: true,
      });
    } catch (e: unknown) {
      installError = e instanceof Error ? e.message : String(e);
    } finally {
      installDone = true;
      clearInterval(progressTimer);
    }

    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    if (installError) {
      tick(0, "Ошибка");
      return { ok: false, error: installError };
    }

    if (!installResult || installResult.timedOut) {
      tick(0, "Таймаут");
      return { ok: false, error: "timeout" };
    }

    // pkg иногда возвращает non-zero при warning — проверяем реально
    tick(92, "Проверка установки…");
    await delay(400);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    const verified = await verifyPackageInstalled(def);
    if (verified) {
      tick(100, "Установлено");
      const map = await loadInstalledMap();
      map[def.id] = true;
      await saveInstalledMap(map);
      return { ok: true };
    }

    // install exit 0 но check fail — всё равно ошибка
    const rawOut = (installResult.stderr || "") + "\n" + (installResult.stdout || "");
    // убрать шум apt CLI warning
    const cleaned = rawOut
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (/apt does not have a stable CLI interface/i.test(t)) return false;
        if (/Use with caution/i.test(t)) return false;
        if (/^WARNING:/i.test(t) && /CLI/i.test(t)) return false;
        // шум mirror probe без сути
        if (/^Testing the available mirrors:?$/i.test(t)) return false;
        return true;
      })
      .join("\n")
      .trim()
      .slice(-500);
    const mirrorNoiseOnly = /Testing the available mirrors/i.test(rawOut) && cleaned.length < 8;
    const hint = mirrorNoiseOnly
      ? "Не удалось достучаться до зеркал Termux (pkg). Проверьте интернет/VPN или в Termux: pkg update && pkg install <пакет>."
      : "";
    tick(0, "Не удалось подтвердить");
    return {
      ok: false,
      error: installResult.exitCode !== 0
        ? `exit ${installResult.exitCode}: ${cleaned || hint || "install failed"}`
        : `verify failed: ${cleaned || "package not detected after install"}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}

/**
 * Удаление пакета.
 */
export async function removeCompilePackage(
  def: CompilePackageDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `CompilePkg:${def.id}`;
  try {
    onProgress(10, "Удаление…");
    await delay(150);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    const r = await runShellCommand(withInstallerEnvironment(def.removeCmd), {
      timeoutMs: REMOVE_TIMEOUT_MS,
      isBuild: true,
    });

    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    onProgress(80, "Проверка…");
    await delay(300);

    const stillThere = await verifyPackageInstalled(def);
    if (!stillThere) {
      onProgress(100, "Удалено");
      const map = await loadInstalledMap();
      map[def.id] = false;
      await saveInstalledMap(map);
      return { ok: true };
    }

    // Раньше soft-ok помечал «удалено» даже если check всё ещё true — ложный индикатор.
    // Теперь только реальный verify=false считается удалением.
    if (r.exitCode === 0 && !r.timedOut && stillThere) {
      return {
        ok: false,
        error: "uninstall exit 0, but verify still detects the package",
      };
    }

    return {
      ok: false,
      error: r.timedOut ? "timeout" : `exit ${r.exitCode}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}
