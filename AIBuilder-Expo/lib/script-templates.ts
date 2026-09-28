/**
 * Built-in Script Runner templates (priority #5).
 */

export type ScriptTemplateIcon =
  | "rocket-outline"
  | "bug-outline"
  | "construct-outline"
  | "code-slash-outline";

export interface ScriptTemplate {
  id: string;
  nameRu: string;
  nameUk: string;
  nameEn: string;
  icon: ScriptTemplateIcon;
  body: string;
}

export const SCRIPT_TEMPLATES: ScriptTemplate[] = [
  {
    id: "tpl-expo-build",
    nameRu: "Сборка Expo",
    nameUk: "Збірка Expo",
    nameEn: "Expo build",
    icon: "rocket-outline",
    body: `#!/data/data/com.termux/files/usr/bin/bash
set -e
# Template: Expo/Gradle debug APK — uses PROJECT config as-is (no version rewrites)
AIB_ROOT="/storage/emulated/0/AIBuilderTermux"
ZIP="\${AIB_ZIP_PATH:-}"
[ -n "$ZIP" ] && [ -f "$ZIP" ] || { echo "Set AIB_ZIP_PATH to project ZIP"; exit 10; }
export GRADLE_USER_HOME="\${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}"
mkdir -p "$GRADLE_USER_HOME" "$HOME/aibuilder-scripts"
echo "=== Expo/Gradle build template ==="
echo "ZIP=$ZIP"
WORK="$AIB_ROOT/.aibuilder/work/tpl-expo"
rm -rf "$WORK" && mkdir -p "$WORK"
unzip -q -o "$ZIP" -d "$WORK/src"
cd "$WORK/src"
if [ -f package.json ] && grep -q '"expo"' package.json 2>/dev/null && [ ! -d android ]; then
  npm install --legacy-peer-deps --no-bin-links 2>&1 | tail -5 || true
  npx expo prebuild --platform android --clean --non-interactive 2>&1 | tail -10 || true
fi
if [ -f android/gradlew ]; then cd android; elif [ -f gradlew ]; then :; else echo "gradlew missing"; exit 22; fi
chmod +x gradlew
./gradlew assembleDebug --stacktrace $AIB_GRADLE_EXTRA_FLAGS 2>&1 | tee "$HOME/aibuilder-scripts/last-build.log"
APK=$(find . -path '*/outputs/apk/*.apk' 2>/dev/null | head -1)
[ -n "$APK" ] || { echo "APK not found"; exit 30; }
echo "APK_PATH=$(pwd)/$APK"
ls -lh "$APK"
command -v aapt >/dev/null && aapt dump badging "$APK" 2>/dev/null | head -15 || true
echo BUILD_OK
`,
  },
  {
    id: "tpl-apk-analyze",
    nameRu: "Анализ APK",
    nameUk: "Аналіз APK",
    nameEn: "Analyze APK",
    icon: "bug-outline",
    body: `#!/data/data/com.termux/files/usr/bin/bash
set -e
APK="\${1:-}"
[ -z "$APK" ] && APK=$(find /storage/emulated/0/Download /storage/emulated/0/AIBuilderTermux -name '*.apk' -type f 2>/dev/null | head -1)
[ -n "$APK" ] && [ -f "$APK" ] || { echo "APK not found"; exit 10; }
OUT="$HOME/aibuilder-reverse/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$OUT"
echo "APK=$APK"
ls -lh "$APK" | tee "$OUT/ls.txt"
command -v aapt >/dev/null && aapt dump badging "$APK" 2>/dev/null | head -40 | tee "$OUT/aapt.txt" || true
unzip -l "$APK" 2>/dev/null | head -60 | tee "$OUT/zip.txt" || true
if command -v jadx >/dev/null 2>&1; then
  jadx -d "$OUT/jadx" --show-bad-code -q "$APK" 2>&1 | tail -20 | tee "$OUT/jadx.log" || true
else
  echo "jadx missing — pkg install jadx"
fi
echo "OUT=$OUT"
echo REVERSE_OK
`,
  },
  {
    id: "tpl-pkg-install",
    nameRu: "Установка пакетов",
    nameUk: "Встановлення пакетів",
    nameEn: "Install packages",
    icon: "construct-outline",
    body: `#!/data/data/com.termux/files/usr/bin/bash
set -e
echo "=== pkg update + base tools ==="
pkg update -y 2>&1 | tail -8 || true
pkg install -y openjdk-17 git wget curl unzip 2>&1 | tail -15 || true
command -v java >/dev/null && java -version 2>&1 | head -1 || echo "java missing"
echo INSTALL_OK
`,
  },
];

export interface RunHistoryEntry {
  id: string;
  scriptName: string;
  exitCode: number;
  ok: boolean;
  at: number;
  tail: string;
  apkPath?: string;
}

export const STORAGE_RUN_HISTORY = "aibuilder.script_runner.run_history.v1";
export const MAX_RUN_HISTORY = 20;

export function extractApkPathFromLog(log: string): string | undefined {
  const text = log || "";
  const patterns = [
    /APK_PATH=(\/[^\s]+)/,
    /\bAPK=(\/[^\s]+\.apk)/i,
    /APK:\s*(\/[^\s]+\.apk)/i,
    /Готовый APK:\s*(\/[^\s]+)/i,
    /signed\.apk[^\n]*?(\/[^\s]+\.apk)/i,
    /(\/storage\/emulated\/0\/[^\s]+\.apk)/i,
    /(\/data\/data\/com\.termux\/[^\s]+\.apk)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m?.[1]) return m[1];
  }
  // last resort: any absolute .apk path
  const any = /(\/[^\s\'\"]+\.apk)\b/i.exec(text);
  return any?.[1];
}

export function tailLog(log: string, maxLines = 40): string {
  const lines = (log || "").split("\n");
  return lines.slice(-maxLines).join("\n");
}
