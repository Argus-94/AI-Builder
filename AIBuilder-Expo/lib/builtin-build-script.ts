/**
 * Встроенный ПРОСТОЙ скрипт сборки APK — использует ТОЧНО конфигурацию проекта.
 * Не меняет version Gradle, не переписывает gradle.properties.
 * ZIP: AIB_ZIP_PATH или $1; каталог = basename архива.
 */

export const BUILTIN_BUILD_SCRIPT_ID = "aib-builtin-build-simple-v1";

const SCRIPT_BODY: string = "#!/data/data/com.termux/files/usr/bin/bash\n# \u041f\u0420\u041e\u0421\u0422\u0410\u042f \u0421\u0411\u041e\u0420\u041a\u0410 - \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f \u0422\u041e\u0427\u041d\u041e \u0442\u043e \u0447\u0442\u043e \u0432 \u043f\u0440\u043e\u0435\u043a\u0442\u0435\n# \u041d\u0438\u043a\u0430\u043a\u0438\u0445 \u0438\u0437\u043c\u0435\u043d\u0435\u043d\u0438\u0439 \u0432\u0435\u0440\u0441\u0438\u0439, \u043d\u0438\u043a\u0430\u043a\u0438\u0445 \u043f\u0435\u0440\u0435\u043f\u0438\u0441\u044b\u0432\u0430\u043d\u0438\u0439 \u043a\u043e\u043d\u0444\u0438\u0433\u043e\u0432\nset -e\nset +o pipefail\n\n# ZIP path: from env AIB_ZIP_PATH (AI Builder field) or first CLI arg\nZIP=\"${AIB_ZIP_PATH:-${1:-}}\"\nif [ -z \"$ZIP\" ]; then\n  echo \"ERROR: ZIP path not set. Pass via AIB_ZIP_PATH or as $1\" >&2\n  exit 10\nfi\nAIB_ROOT=\"/storage/emulated/0/AIBuilderTermux\"\nAIB_INTERNAL=\"$AIB_ROOT/.aibuilder\"\nAIB_WORK=\"$AIB_INTERNAL/work\"\nAIB_GRADLE=\"${HOME}/.aibuilder-gradle\"\nAIB_TMP=\"$AIB_INTERNAL/tmp\"\nAIB_KEYS=\"$AIB_INTERNAL/keys\"\nZIP_BASE=$(basename \"$ZIP\")\nZIP_STEM=\"${ZIP_BASE%.*}\"\nZIP_STEM=$(echo \"$ZIP_STEM\" | sed \"s/[^a-zA-Z0-9._-]/_/g\")\n[ -z \"$ZIP_STEM\" ] && ZIP_STEM=\"project\"\nPROJECT=\"$AIB_ROOT/$ZIP_STEM\"\n\nmkdir -p \"$AIB_INTERNAL\" \"$AIB_WORK\" \"$AIB_GRADLE\" \"$AIB_TMP\" \"$AIB_KEYS\"\n\nLOG_FILE=\"$AIB_TMP/build-$(date +%Y%m%d-%H%M%S).log\"\n\nlog() {\n  echo \"[$(date '+%H:%M:%S')] $*\" | tee -a \"$LOG_FILE\"\n}\n\nlog \"==========================================\"\nlog \"\u0421\u0411\u041e\u0420\u041a\u0410 - \u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442 \u0422\u041e\u0427\u041d\u041e \u0442\u043e \u0447\u0442\u043e \u0432 \u043f\u0440\u043e\u0435\u043a\u0442\u0435\"\nlog \"==========================================\"\n\necho \"=== [1/5] \u0420\u0430\u0441\u043f\u0430\u043a\u043e\u0432\u043a\u0430 ===\"\ntest -f \"$ZIP\" || { log \"ERROR: ZIP \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\"; exit 10; }\nrm -rf \"$AIB_TMP/aib-script-extract\"\nunzip -q -o \"$ZIP\" -d \"$AIB_TMP/aib-script-extract\"\n\nENTRIES=$(find \"$AIB_TMP/aib-script-extract\" -mindepth 1 -maxdepth 1)\nCOUNT=$(echo \"$ENTRIES\" | grep -c .)\nif [ \"$COUNT\" -eq 1 ] && [ -d \"$ENTRIES\" ]; then\n  SRC=\"$ENTRIES\"\nelse\n  SRC=\"$AIB_TMP/aib-script-extract\"\nfi\n\nrm -rf \"$PROJECT\"\ncp -a \"$SRC\" \"$PROJECT\"\nlog \"\u2713 \u041f\u0440\u043e\u0435\u043a\u0442 \u0433\u043e\u0442\u043e\u0432\"\n\ncd \"$PROJECT\"\n\necho \"=== [2/5] Expo prebuild (\u0435\u0441\u043b\u0438 \u043d\u0443\u0436\u0435\u043d) ===\"\nif [ -f \"package.json\" ] && grep -q '\"expo\"' package.json 2>/dev/null; then\n  if [ ! -d \"android\" ]; then\n    log \"\u041d\u0443\u0436\u0435\u043d Android \u0447\u0435\u0440\u0435\u0437 expo...\"\n    \n    if command -v corepack >/dev/null 2>&1; then\n      corepack disable >/dev/null 2>&1 || true\n    fi\n    \n    # Prefer project packageManager (pnpm) \u2014 never rewrite package.json.\n    # Fallback: npm ci / npm install. Do not change compile settings.\n    if command -v corepack >/dev/null 2>&1; then\n      corepack enable >/dev/null 2>&1 || true\n    fi\n    if [ -f pnpm-lock.yaml ] && command -v pnpm >/dev/null 2>&1; then\n      log \"deps: pnpm install --frozen-lockfile\"\n      pnpm install --frozen-lockfile --ignore-scripts 2>&1 | tail -25 >> \"$LOG_FILE\" || \\\n        pnpm install --ignore-scripts 2>&1 | tail -25 >> \"$LOG_FILE\"\n    elif [ -f package-lock.json ]; then\n      log \"deps: npm ci\"\n      npm ci --legacy-peer-deps --no-bin-links 2>&1 | tail -20 >> \"$LOG_FILE\"\n    else\n      log \"deps: npm install\"\n      npm install --legacy-peer-deps --no-bin-links 2>&1 | tail -20 >> \"$LOG_FILE\"\n    fi\n    \n    \n    EXPO_CLI=\"\"\n    for cand in \"$PROJECT/node_modules/expo/bin/cli\" \"$PROJECT/node_modules/expo/bin/cli.js\"; do\n      [ -f \"$cand\" ] && { EXPO_CLI=\"$cand\"; break; }\n    done\n    \n    if [ -n \"$EXPO_CLI\" ]; then\n      log \"expo prebuild...\"\n      set +e\n      node \"$EXPO_CLI\" prebuild --platform android --clean --non-interactive 2>&1 | tee -a \"$LOG_FILE\" | tail -20\n      PB_EC=${PIPESTATUS[0]}\n      set -e\n      if [ \"$PB_EC\" -ne 0 ]; then\n        log \"ERROR: expo prebuild failed exit=$PB_EC\"\n        exit 23\n      fi\n    fi\n  fi\nfi\n\nif [ -f \"android/gradlew\" ]; then\n  cd android\nelif [ -f \"gradlew\" ]; then\n  cd .\nelse\n  log \"ERROR: gradlew \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d \u043f\u043e\u0441\u043b\u0435 prebuild/unpack\"; exit 22\nfi\n\nlog \"\u2713 Android \u043a\u0430\u0442\u0430\u043b\u043e\u0433: $(pwd)\"\n\necho \"=== [3/5] \u041d\u0430\u0441\u0442\u0440\u043e\u0439\u043a\u0430 \u043e\u043a\u0440\u0443\u0436\u0435\u043d\u0438\u044f ===\"\n\n# \u041d\u0430\u0445\u043e\u0434\u0438\u043c SDK\nSDK=\"\"\nfor d in \"$ANDROID_HOME\" \"$ANDROID_SDK_ROOT\" \"$PREFIX/opt/android-sdk\" \"$PREFIX/share/android-sdk\" \"$PREFIX/lib/android-sdk\"; do\n  [ -d \"$d\" ] && { SDK=\"$d\"; break; }\ndone\n[ -z \"$SDK\" ] && { log \"ERROR: Android SDK \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\"; exit 20; }\n\n# \u041d\u0430\u0445\u043e\u0434\u0438\u043c Java\nJH=\"\"\nfor d in \"$PREFIX/lib/jvm/java-17-openjdk\" \"$JAVA_HOME\" \"$PREFIX/lib/jvm/java-21-openjdk\"; do\n  [ -x \"$d/bin/java\" ] 2>/dev/null && { JH=\"$d\"; break; }\ndone\n[ -z \"$JH\" ] && { log \"ERROR: Java \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\u0430\"; exit 21; }\n\n# \u042d\u043a\u0441\u043f\u043e\u0440\u0442\u0438\u0440\u0443\u0435\u043c\nexport JAVA_HOME=\"$JH\"\nexport ANDROID_HOME=\"$SDK\"\nexport ANDROID_SDK_ROOT=\"$SDK\"\nexport PATH=\"$JAVA_HOME/bin:$SDK/cmdline-tools/latest/bin:$SDK/platform-tools:$PATH\"\nBT=$(ls -d \"$SDK/build-tools\"/*/ 2>/dev/null | tail -1)\n[ -n \"$BT\" ] && export PATH=\"$BT:$PATH\"\n\n# \u041b\u0438\u0446\u0435\u043d\u0437\u0438\u0438\nmkdir -p \"$SDK/licenses\"\nexport GRADLE_USER_HOME=\"$AIB_GRADLE\"\nprintf '%s\\n' '24333f8a63b6825ea9c5514f83c2829b004d1fee' > \"$SDK/licenses/android-sdk-license\"\nprintf '%s\\n' '84831b9409646a918e30573bab4c9c91346d8abd' > \"$SDK/licenses/android-sdk-preview-license\"\n\n# Ensure local.properties for AGP (env ANDROID_HOME alone is not always enough)\necho \"sdk.dir=$SDK\" > local.properties\nlog \"\u2713 local.properties sdk.dir=$SDK\"\n\nlog \"\u2713 Java: $(basename $JH)\"\nlog \"\u2713 SDK: $(basename $SDK)\"\n\n# \u041f\u043e\u043a\u0430\u0437\u044b\u0432\u0430\u0435\u043c \u0432\u0435\u0440\u0441\u0438\u044e Gradle \u0438\u0437 \u043f\u0440\u043e\u0435\u043a\u0442\u0430\nif [ -f \"gradle/wrapper/gradle-wrapper.properties\" ]; then\n  GRADLE_VER=$(grep \"distributionUrl\" gradle/wrapper/gradle-wrapper.properties | sed 's/.*gradle-//' | sed 's/-all.*//')\n  log \"\u2713 Gradle \u0432\u0435\u0440\u0441\u0438\u044f \u0438\u0437 \u043f\u0440\u043e\u0435\u043a\u0442\u0430: $GRADLE_VER\"\nfi\n\necho \"=== [4/5] \u0421\u0411\u041e\u0420\u041a\u0410 ===\"\n\n[ ! -f gradlew ] && { log \"ERROR: gradlew \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d\"; exit 22; }\nchmod +x gradlew 2>/dev/null || true\n\nASSEMBLE_TASK=\"${AIB_ASSEMBLE_TASK:-assembleDebug}\"\nASSEMBLE_TASK=$(echo \"$ASSEMBLE_TASK\" | tr -cd 'a-zA-Z0-9')\n[ -z \"$ASSEMBLE_TASK\" ] && ASSEMBLE_TASK=assembleDebug\nlog \"\u0417\u0430\u043f\u0443\u0441\u043a: ./gradlew $ASSEMBLE_TASK\"\nlog \"(\u0438\u0441\u043f\u043e\u043b\u044c\u0437\u0443\u0435\u0442\u0441\u044f \u0432\u0435\u0440\u0441\u0438\u044f Gradle \u0438\u0437 gradle/wrapper/gradle-wrapper.properties)\"\nlog \"\"\n\n# Task via AIB_ASSEMBLE_TASK (default assembleDebug). Heap via AIB_GRADLE_JVMARGS / EXTRA_FLAGS.\nJVM_ARGS=\"${AIB_GRADLE_JVMARGS:--Xmx1536m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8}\"\nLOCKDIR=\"${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}/.aib-build.lockdir\"\nif [ -d \"$LOCKDIR\" ]; then\n  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y \"$LOCKDIR\" 2>/dev/null || echo 0) ))\n  if [ \"$LOCK_AGE\" -gt 2700 ]; then\n    log \"STALE_BUILD_LOCK age=${LOCK_AGE}s \u2014 \u0441\u043d\u0438\u043c\u0430\u044e\"\n    rm -rf \"$LOCKDIR\"\n  fi\nfi\nif ! mkdir \"$LOCKDIR\" 2>/dev/null; then\n  log \"\u0434\u0440\u0443\u0433\u0430\u044f \u0441\u0431\u043e\u0440\u043a\u0430 \u0434\u0435\u0440\u0436\u0438\u0442 lock \u2014 \u0436\u0434\u0443 \u0434\u043e 120\u0441\"\n  waited=0\n  while [ $waited -lt 120 ]; do\n    sleep 5; waited=$((waited+5))\n    if [ -d \"$LOCKDIR\" ]; then\n      LA=$(( $(date +%s) - $(stat -c %Y \"$LOCKDIR\" 2>/dev/null || echo 0) ))\n      [ \"$LA\" -gt 2700 ] && rm -rf \"$LOCKDIR\"\n    fi\n    mkdir \"$LOCKDIR\" 2>/dev/null && break\n  done\nfi\n[ -d \"$LOCKDIR\" ] || { log \"ERROR: BUILD_LOCK_TIMEOUT\"; exit 40; }\ntrap 'rmdir \"$LOCKDIR\" 2>/dev/null || true' EXIT\nif bash gradlew \"$ASSEMBLE_TASK\" --no-daemon --max-workers=2 --stacktrace -Dorg.gradle.jvmargs=\"$JVM_ARGS\" $AIB_GRADLE_EXTRA_FLAGS 2>&1 | tee \"$AIB_TMP/gradle.log\"; then\n  log \"\u2705 Gradle \u0437\u0430\u0432\u0435\u0440\u0448\u0438\u043b\u0441\u044f \u0443\u0441\u043f\u0435\u0448\u043d\u043e\"\nelse\n  GEC=$?\n  log \"\u274c Gradle \u0432\u0435\u0440\u043d\u0443\u043b \u043a\u043e\u0434 $GEC\"\n  log \"\"\n  log \"\u041f\u041e\u0421\u041b\u0415\u0414\u041d\u0418\u0415 50 \u0421\u0422\u0420\u041e\u041a:\"\n  tail -50 \"$AIB_TMP/gradle.log\"\n  exit $GEC\nfi\n\necho \"=== [5/5] \u0424\u0438\u043d\u0430\u043b\u0438\u0437\u0430\u0446\u0438\u044f ===\"\n\n# \u0418\u0449\u0435\u043c APK\npick_newest_apk() {\n  find \"$@\" -type f -name \"*.apk\" 2>/dev/null | while read -r f; do\n    [ -f \"$f\" ] || continue\n    printf \"%s\\t%s\\n\" \"$(stat -c %Y \"$f\" 2>/dev/null || echo 0)\" \"$f\"\n  done | sort -nr | head -1 | cut -f2-\n}\nRAW_APK=$(pick_newest_apk app/build/outputs/apk build/outputs/apk . 2>/dev/null)\nif [ -n \"$RAW_APK\" ] && [ \"${RAW_APK#/}\" = \"$RAW_APK\" ]; then\n  RAW_APK=\"$(pwd)/${RAW_APK#./}\"\nfi\n\nif [ -z \"$RAW_APK\" ] || [ ! -f \"$RAW_APK\" ]; then\n  log \"\u274c APK \u043d\u0435 \u043d\u0430\u0439\u0434\u0435\u043d (app/build/outputs, build/outputs, recursive)\"\n  log \"\u0421\u043e\u0434\u0435\u0440\u0436\u0438\u043c\u043e\u0435 outputs:\"\n  find . -type d -name outputs 2>/dev/null | head -10\n  find . -name \"*.apk\" 2>/dev/null | head -20\n  exit 30\nfi\n\nlog \"\u2713 \u041d\u0430\u0439\u0434\u0435\u043d: $(basename $RAW_APK)\"\n\n# \u041f\u043e\u0434\u043f\u0438\u0441\u044c \u0435\u0441\u043b\u0438 \u0432\u043e\u0437\u043c\u043e\u0436\u043d\u0430 (soft-fail \u2014 unsigned APK \u0442\u043e\u0436\u0435 \u0443\u0441\u043f\u0435\u0445)\nBT=$(ls -d \"$SDK/build-tools\"/*/ 2>/dev/null | tail -1)\nZIPALIGN=\"\"; APKSIGNER=\"\"\n[ -n \"$BT\" ] && [ -x \"${BT}zipalign\" ] && ZIPALIGN=\"${BT}zipalign\"\n[ -n \"$BT\" ] && [ -x \"${BT}apksigner\" ] && APKSIGNER=\"${BT}apksigner\"\n[ -z \"$ZIPALIGN\" ] && command -v zipalign >/dev/null 2>&1 && ZIPALIGN=$(command -v zipalign)\n[ -z \"$APKSIGNER\" ] && command -v apksigner >/dev/null 2>&1 && APKSIGNER=$(command -v apksigner)\n\nif [ -n \"$ZIPALIGN\" ] && [ -n \"$APKSIGNER\" ]; then\n  KS=\"$AIB_KEYS/aib-debug.keystore\"\n  if [ ! -s \"$KS\" ]; then\n    keytool -genkeypair -v -keystore \"$KS\" -storepass android -keypass android \\\n      -alias androiddebugkey -keyalg RSA -keysize 2048 -validity 10000 \\\n      -dname \"CN=AIBuilder,O=Termux,C=US\" 2>&1 | tail -2 >> \"$LOG_FILE\" || true\n  fi\n\n  mkdir -p \"$AIB_WORK/outputs\"\n  BASE=$(basename \"$RAW_APK\" .apk)\n  ALIGNED=\"$AIB_WORK/outputs/$BASE-aligned.apk\"\n  SIGNED=\"$AIB_WORK/outputs/$BASE-signed.apk\"\n\n  set +e\n  \"$ZIPALIGN\" -f -p 4 \"$RAW_APK\" \"$ALIGNED\"\n  ZA=$?\n  if [ $ZA -ne 0 ]; then ALIGNED=\"$RAW_APK\"; log \"zipalign fail \u2014 use raw\"; fi\n  \"$APKSIGNER\" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true \\\n    --ks \"$KS\" --ks-pass pass:android --key-pass pass:android --ks-key-alias androiddebugkey \\\n    --out \"$SIGNED\" \"$ALIGNED\"\n  SA=$?\n  set -e\n  if [ $SA -eq 0 ] && [ -s \"$SIGNED\" ]; then\n    RAW_APK=\"$SIGNED\"\n    log \"\u2713 APK \u043f\u043e\u0434\u043f\u0438\u0441\u0430\u043d V1+V2+V3\"\n    echo \"SIGNED_V1_V2_V3_OK=$RAW_APK\"\n  else\n    log \"\u043f\u043e\u0434\u043f\u0438\u0441\u044c \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c \u2014 \u043e\u0442\u0434\u0430\u0451\u043c unsigned APK\"\n    echo \"UNSIGNED_APK_OK=$RAW_APK\"\n  fi\nelse\n  log \"zipalign/apksigner \u043d\u0435\u0442 \u2014 unsigned APK\"\n  echo \"UNSIGNED_APK_OK=$RAW_APK\"\nfi\n\n# \u041a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u0438\u0435 \u0432 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u044b\u0435 Downloads (termux-setup-storage \u0438\u043b\u0438 \u043f\u0440\u044f\u043c\u043e\u0439 \u043f\u0443\u0442\u044c)\nBN=$(basename \"$RAW_APK\")\nCOPIED=\"\"\nfor dest in \"$HOME/storage/downloads\" \"/storage/emulated/0/Download\" \"/sdcard/Download\"; do\n  mkdir -p \"$dest\" 2>/dev/null || true\n  if cp -f \"$RAW_APK\" \"$dest/$BN\" 2>/dev/null; then\n    COPIED=\"$dest/$BN\"\n    break\n  fi\ndone\n\nSIZE=$(ls -lh \"$RAW_APK\" | awk '{print $5}')\n\nlog \"\"\nlog \"==========================================\"\nlog \"\u2705 \u0423\u0421\u041f\u0415\u0428\u041d\u041e\"\nlog \"==========================================\"\nlog \"APK: $RAW_APK\"\nlog \"\u0420\u0430\u0437\u043c\u0435\u0440: $SIZE\"\n[ -n \"$COPIED\" ] && log \"\u0421\u043a\u043e\u043f\u0438\u0440\u043e\u0432\u0430\u043d\u043e: $COPIED\" || log \"\u041a\u043e\u043f\u0438\u044f \u0432 Download \u043d\u0435 \u0443\u0434\u0430\u043b\u0430\u0441\u044c (\u043d\u0435\u0442 storage permission?)\"\nlog \"==========================================\"\necho \"APK_PATH=$RAW_APK\"\n";

export function getBuiltinBuildScript(): string {
  return SCRIPT_BODY;
}

function toBase64(scriptBody: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(scriptBody, "utf8").toString("base64");
  }
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const bytes = unescape(encodeURIComponent(scriptBody));
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes.charCodeAt(i);
    const b = i + 1 < bytes.length ? bytes.charCodeAt(i + 1) : 0;
    const c = i + 2 < bytes.length ? bytes.charCodeAt(i + 2) : 0;
    out += chars[a >> 2];
    out += chars[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? chars[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? chars[c & 63] : "=";
  }
  return out;
}

/**
 * Канонический путь user-скрипта.
 * Приоритет: $HOME (надёжнее, нет noexec/permission issues на /storage),
 * fallback на shared storage для совместимости.
 * materializeUserScript пишет через Termux, поэтому $HOME резолвится в Termux.
 */
export const AIB_USER_SCRIPT_PATH_HOME = "$HOME/aibuilder-scripts/aib-user-script.sh";
export const AIB_USER_SCRIPT_PATH_STORAGE =
  "/storage/emulated/0/AIBuilderTermux/.aibuilder/tmp/aib-user-script.sh";
/** Default: HOME path (stable Termux channel). */
export const AIB_USER_SCRIPT_PATH = AIB_USER_SCRIPT_PATH_HOME;

/** Failed script kept next to log for open/edit/retry. */
export const AIB_LAST_FAILED_SCRIPT_PATH = "$HOME/aibuilder-scripts/aib-last-failed.sh";
export const AIB_LAST_FAILED_LOG_PATH = "$HOME/aibuilder-scripts/aib-last-failed.log";

/**
 * Paths may contain $HOME / $PREFIX — must NOT be single-quoted in shell
 * or variables never expand. Absolute paths without $ are safe to quote.
 */
export function shellPathExpr(path: string): string {
  const p = String(path || "");
  if (/\$[A-Za-z_]/.test(p) || p.startsWith("~")) {
    // Allow shell expansion: escape only double-quotes and backslashes
    return `"${p.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
  }
  return `'${p.replace(/'/g, `'"'"'`)}'`;
}

export type TermuxRunner = (
  cmd: string,
  opts?: { timeoutMs?: number },
) => Promise<{ exitCode: number; stdout: string; stderr: string; timedOut?: boolean }>;

export interface MaterializeProgress {
  phase: "prep" | "chunk" | "verify";
  current: number;
  total: number;
  detail?: string;
}

export interface MaterializeOptions {
  onProgress?: (p: MaterializeProgress) => void;
  /** Override target path (default AIB_USER_SCRIPT_PATH). */
  scriptPath?: string;
}

/** UTF-8 byte length of string (for size verify after base64 decode). */
export function utf8ByteLength(s: string): number {
  if (typeof Buffer !== "undefined") return Buffer.byteLength(s, "utf8");
  // RN fallback
  let n = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 0x80) n += 1;
    else if (c < 0x800) n += 2;
    else if (c >= 0xd800 && c <= 0xdbff) {
      n += 4;
      i++;
    } else n += 3;
  }
  return n;
}

/**
 * Пишет тело скрипта на диск кусками base64 (короткие команды Termux),
 * чтобы не упираться в лимит RUN_COMMAND / binder на длинный one-shot.
 * Проверяет размер файла == utf8ByteLength(body).
 */
export async function materializeUserScript(
  scriptBody: string,
  run: TermuxRunner,
  options?: MaterializeOptions,
): Promise<string> {
  const scriptPath = options?.scriptPath || AIB_USER_SCRIPT_PATH;
  const dir = scriptPath.replace(/\/[^/]+$/, "");
  const sp = shellPathExpr(scriptPath);
  const dp = shellPathExpr(dir);
  const expectedBytes = utf8ByteLength(scriptBody);
  const b64 = toBase64(scriptBody);
  const chunkSize = 2400;
  const totalChunks = Math.max(1, Math.ceil(b64.length / chunkSize));

  options?.onProgress?.({ phase: "prep", current: 0, total: totalChunks, detail: "prep" });

  const prep = await run(
    `mkdir -p ${dp} && : > ${sp} && echo PREP_OK`,
    { timeoutMs: 20_000 },
  );
  if (prep.exitCode !== 0 && !/PREP_OK/.test(prep.stdout || "")) {
    throw new Error(
      `Cannot prepare script file: exit=${prep.exitCode} ${(prep.stderr || prep.stdout || "").slice(0, 200)}`,
    );
  }

  let chunkIndex = 0;
  for (let i = 0; i < b64.length; i += chunkSize) {
    chunkIndex += 1;
    const c = b64.slice(i, i + chunkSize);
    options?.onProgress?.({
      phase: "chunk",
      current: chunkIndex,
      total: totalChunks,
      detail: `chunk ${chunkIndex}/${totalChunks}`,
    });
    const r = await run(`printf '%s' '${c}' | base64 -d >> ${sp}`, { timeoutMs: 20_000 });
    if (r.exitCode !== 0) {
      throw new Error(
        `Script chunk write failed at ${chunkIndex}/${totalChunks}: exit=${r.exitCode} ${(r.stderr || "").slice(0, 160)}`,
      );
    }
  }

  options?.onProgress?.({
    phase: "verify",
    current: totalChunks,
    total: totalChunks,
    detail: `verify size=${expectedBytes}`,
  });

  // Robust size check: Termux may drop multi-line stdout (log showed only "14475 path").
  const parseSize = (text: string): number => {
    const s = String(text || "");
    const m1 = /SIZE=(\d+)/.exec(s);
    if (m1) return Number(m1[1]);
    // "14475 /path/to/file" or bare number
    const m2 = /^\s*(\d+)\b/m.exec(s);
    if (m2) return Number(m2[1]);
    const digits = s.replace(/\D+/g, " ").trim().split(/\s+/).filter(Boolean);
    return digits.length ? Number(digits[0]) : 0;
  };

  const verify = await run(
    `chmod +x ${sp} 2>/dev/null || true; ACT=$(wc -c < ${sp} 2>/dev/null | tr -d ' \t\n\r'); printf 'SIZE=%s\n' "$ACT"`,
    { timeoutMs: 15_000 },
  );
  let actual = parseSize(`${verify.stdout || ""}\n${verify.stderr || ""}`);

  if (!(actual === expectedBytes && actual > 0)) {
    const again = await run(
      `wc -c < ${sp} 2>/dev/null | tr -d ' \t\n\r'`,
      { timeoutMs: 10_000 },
    );
    actual = parseSize(again.stdout || "") || parseSize(again.stderr || "");
  }

  // Accept exact match, or tiny drift, or non-empty file when expected>0 and exit 0
  const sizeOk = actual === expectedBytes && actual > 0;
  const driftOk = actual > 100 && Math.abs(actual - expectedBytes) <= 8;
  if (!sizeOk && !driftOk) {
    // Last resort: test -s only (chunks all exited 0) — avoid blocking real builds
    const exists = await run(
      `test -s ${sp} && echo EXISTS || echo MISSING`,
      { timeoutMs: 10_000 },
    );
    if (!/EXISTS/.test(exists.stdout || "")) {
      throw new Error(
        `Script verify failed: expected=${expectedBytes} actual=${actual} exit=${verify.exitCode} out=${String(verify.stdout || "").slice(0, 200)}`,
      );
    }
    // File exists and non-empty after successful chunk writes — proceed with warning size
  }
  return scriptPath;
}

/**
 * Короткая команда запуска: скрипт УЖЕ на диске (см. materializeUserScript).
 * Не тащит тело скрипта в base64 внутри одной команды.
 */
export function buildTermuxLaunchCommand(
  zipPath: string | undefined | null,
  scriptPath: string = AIB_USER_SCRIPT_PATH,
): string {
  const safeZip = (zipPath || "").replace(/'/g, `'"'"'`);
  const scriptExpr = shellPathExpr(scriptPath || AIB_USER_SCRIPT_PATH);
  // Seed Termux SDK/Java env BEFORE user script runs.
  // User scripts often reuse PREFIX (e.g. ZIP name prefix) and then
  // "$PREFIX/opt/android-sdk" points nowhere. ANDROID_HOME survives that.
  const envPreamble = [
    'export PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"',
    'export TERMUX_PREFIX="$PREFIX"',
    'if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then',
    '  for d in "$PREFIX/opt/android-sdk" "$PREFIX/share/android-sdk" "$PREFIX/lib/android-sdk"; do',
    '    [ -d "$d" ] && export ANDROID_HOME="$d" ANDROID_SDK_ROOT="$d" && break',
    '  done',
    'fi',
    'if [ -z "${JAVA_HOME:-}" ]; then',
    '  for d in "$PREFIX/lib/jvm/java-17-openjdk" "$PREFIX/lib/jvm/java-21-openjdk" "$PREFIX/lib/jvm/java-11-openjdk"; do',
    '    [ -x "$d/bin/java" ] && export JAVA_HOME="$d" && break',
    '  done',
    'fi',
    '[ -n "$JAVA_HOME" ] && export PATH="$JAVA_HOME/bin:$PATH"',
    '[ -n "$ANDROID_HOME" ] && export PATH="$PATH:$ANDROID_HOME/platform-tools"',
    'export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}"',
    'mkdir -p "$GRADLE_USER_HOME"',
  ].join("\n");
  const lines: string[] = [
    envPreamble,
    // Без TTY bash/gradle буферизуют вывод → в логе «stdout 0 байт» и непонятно, живо ли
    "export PYTHONUNBUFFERED=1",
    "export TERM=${TERM:-xterm}",
    "set -e",
    `SCRIPT=${scriptExpr}`,
    'test -s "$SCRIPT" || { echo "SCRIPT_MISSING: $SCRIPT" >&2; exit 9; }',
  ];
  if (safeZip) {
    lines.push(`export AIB_ZIP_PATH='${safeZip}'`);
  }
  lines.push(
    'echo "=== AI Builder Script Runner ==="',
    safeZip
      ? 'echo "ZIP: $AIB_ZIP_PATH"'
      : 'echo "ZIP: (none) — скрипт может сам искать архив в AIBuilderTermux"',
    'echo "SCRIPT: $SCRIPT"',
    'wc -c "$SCRIPT" | awk \'{print "SIZE: "$1" bytes"}\'',
    'echo "START: $(date \'+%H:%M:%S\') — ждите строки лога; Gradle часто 5–20 мин"',
    'echo "---"',
    // set +e: чтобы после скрипта напечатать END и код выхода
    "set +e",
    'if command -v stdbuf >/dev/null 2>&1; then',
    '  stdbuf -oL -eL bash -o pipefail "$SCRIPT"',
    "else",
    '  bash -o pipefail "$SCRIPT"',
    "fi",
    "EC=$?",
    'echo "---"',
    'echo "END: $(date \'+%H:%M:%S\') exit=$EC"',
    "exit $EC",
  );
  return lines.join("\n");
}

export function buildStopCommand(): string {
  return [
    "pkill -f 'aib-user-script|gradlew|assembleDebug' 2>/dev/null || true",
    "sleep 0.4",
    "pkill -9 -f 'aib-user-script|gradlew|assembleDebug' 2>/dev/null || true",
    "echo AIB_SCRIPT_STOPPED",
  ].join("; ");
}




