/**
 * High-level agent engine: deterministic create-app, toolchain ensure,
 * Gradle error classification. Used by termux-agent before/around the LLM loop
 * so success does not depend on free-form bash from the model.
 */
import { executeGuardedTermuxCommand } from "./termux-executor";
import { persistentLogger } from "./persistent-logger";
import { runRepairRecipe } from "./repair-script-runner";

/** Soft product words: user wish without explicit "приложение". */
const SOFT_APP_PRODUCT =
  /(игр[уаы]|утилит|виджет|программ[уаы]|таймер|timer|заметк|notes?|счётчик|счетчик|counter|трекер|tracker|чат|chat|бот|bot|клиент|reader|плеер|player|конвертер|converter|переводчик|flashlight|фонарик|погод|weather|калькул|todo|список\s+дел)/i;

export function isStrongCreateAppTask(task: string): boolean {
  const m = (task || "").toLowerCase();
  if (/CREATE_APP_PIPELINE/i.test(task)) return true;
  // JS \b is ASCII-only — Cyrillic verbs like «создай» never matched. Use open stems.
  const create =
    /(создай|создать|создадим|создайте|создал|создам|сгенерируй|зроби|створи|напиши|сделай|разработай|\bgenerate\b|\bcreate\b|\bscaffold\b|\bmake\b|\bdevelop\b|new\s+app)/i.test(
      m,
    );
  // «Собери hello world / calculator apk» without a path/zip → create-from-scratch, not zip builder
  const buildAsCreate =
    !create &&
    /(собери|збери|собрать|build|compile|assemble)/i.test(m) &&
    !/(\.zip|\/storage\/|\/sdcard\/|gradlew|из\s+исход|from\s+source)/i.test(m) &&
    (SOFT_APP_PRODUCT.test(m) ||
      /(hello\s*world|хело|helloworld|калькул|\bcalculator\b|\btodo\b|игр[аыу]|\b2048\b|мини.?app|mini.?app)/i.test(m));
  if (!create && !buildAsCreate) return false;
  if (buildAsCreate) {
    // product intent without sources → treat as strong create
    return true;
  }
  // Explicit app/apk/android/project
  const app =
    /(приложен|додат(ок|ка)|\bapps?\b|\bapplication\b|\bprojects?\b|про[еє]кт|\bapk\b|\bandroid\b|калькул|конкул|\bcalculator\b|\bcalc\b|\btodo\b|\bgames?\b|игр[аыу]|\b2048\b|\btictactoe\b|\bsnake\b|hello\s*world|хело|helloworld|мини.?app|mini.?app)/i.test(
      m,
    );
  if (app) return true;
  // "Напиши таймер" / "сделай трекер воды" — product wish without saying "app"
  if (SOFT_APP_PRODUCT.test(m)) return true;
  // "Напиши … на android / под android / mobile"
  if (/(на|под|for)\s+android|\bmobile\b/i.test(m)) return true;
  // "Напиши [длинное пожелание] приложение" already in app; 
  // Long create requests that mention UI/screens/кнопк → treat as app build
  if (m.length >= 24 && /(экран|кнопк|activity|layout|material|ui\b)/i.test(m)) return true;
  return false;
}

function translitRu(s: string): string {
  const map: Record<string, string> = {
    а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z",
    и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
    с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
    ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
  };
  return s
    .split("")
    .map((ch) => {
      const low = ch.toLowerCase();
      const tr = map[low];
      if (tr === undefined) return /[a-z0-9]/i.test(ch) ? ch : "";
      return ch === low ? tr : tr.charAt(0).toUpperCase() + tr.slice(1);
    })
    .join("");
}

export function guessAppNameStrong(task: string): string {
  const m = task.match(
    /\b(калькулятор|конкулятор|calculator|2048|todo|snake|tictactoe|game|hello\s*world|хело\s*ворд|helloworld|hello|мини.?app|mini.?app|тест|test\s*app|таймер|timer|заметк\w*|notes?|трекер|tracker)\b/i,
  );
  if (m) {
    const x = m[1].toLowerCase().replace(/\s+/g, "");
    if (x.includes("кальк") || x.includes("конкул") || x === "calculator") return "Calculator";
    if (x === "2048") return "Game2048";
    if (x.includes("hello") || x.includes("хело")) return "HelloWorld";
    if (x.includes("todo")) return "TodoApp";
    if (x.includes("snake")) return "Snake";
    if (x.includes("tictactoe")) return "TicTacToe";
    if (/тест|test/.test(x)) return "TestApp";
    if (/мини|mini/.test(x)) return "MiniApp";
    if (/таймер|timer/.test(x)) return "Timer";
    if (/заметк|note/.test(x)) return "Notes";
    if (/трекер|tracker/.test(x)) return "Tracker";
    return x.charAt(0).toUpperCase() + x.slice(1).replace(/[^a-zA-Z0-9]/g, "");
  }
  // Derive folder name from free-form wish after create verb
  const after = task.match(
    /(?:создай|создать|создадим|создайте|создал|создам|сгенерируй|зроби|створи|напиши|сделай|разработай|generate|create|scaffold|make|develop)\s+(.+)/i,
  );
  let rest = (after?.[1] || task).toLowerCase();
  rest = rest
    .replace(
      /\b(простой|простое|простую|android|приложение|приложения|додаток|app|apk|игру|игра|mobile|проект|project|пожалуйста|please)\b/gi,
      " ",
    )
    .replace(/[^a-zа-яё0-9\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const parts = rest.split(" ").filter((w) => w.length > 2).slice(0, 3);
  if (!parts.length) return "MiniApp";
  const slug = translitRu(parts.join(" ")).replace(/[^a-zA-Z0-9]/g, "");
  if (slug.length < 2) return "MiniApp";
  const name = slug.charAt(0).toUpperCase() + slug.slice(1);
  return name.slice(0, 32);
}


/** Deterministic minimal Android Gradle app (Java) under AIBuilderTermux. Trusted internal only. */
export function buildDeterministicCreateAppScript(
  appName: string,
  packageName: string,
  opts?: { forceFresh?: boolean },
): string {
  const safe = appName.replace(/[^a-zA-Z0-9_]/g, "") || "MiniApp";
  // Each applicationId segment must be a valid Java identifier (letter start)
  let pkg = packageName.replace(/[^a-zA-Z0-9.]/g, "") || "com.aibuilder.mini";
  pkg = pkg
    .split(".")
    .map((seg) => {
      const s = (seg || "app").toLowerCase().replace(/[^a-z0-9_]/g, "") || "app";
      return /^[a-z_]/.test(s) ? s : "app" + s;
    })
    .join(".");
  const pkgPath = pkg.replace(/\./g, "/");
  const force = opts?.forceFresh ? "1" : "0";
  const parts: string[] = [];
  parts.push("set -e");
  parts.push("set +o pipefail");
  parts.push('ROOT="/storage/emulated/0/AIBuilderTermux/' + safe + '"');
  parts.push('FORCE_FRESH="' + force + '"');
  parts.push('REUSE=0');
  parts.push(
    'if [ "$FORCE_FRESH" = "1" ]; then rm -rf "$ROOT"; echo "FRESH_WIPE=$ROOT"; '
    + 'elif [ -d "$ROOT" ] && { [ -f "$ROOT/settings.gradle" ] || [ -f "$ROOT/settings.gradle.kts" ]; } '
    + '&& [ -f "$ROOT/gradlew" ] && { [ -f "$ROOT/app/build.gradle" ] || [ -f "$ROOT/app/build.gradle.kts" ]; }; then '
    + 'REUSE=1; echo "REUSE_EXISTING_PROJECT=$ROOT"; '
    + 'else rm -rf "$ROOT"; echo "NEW_PROJECT=$ROOT"; fi',
  );
  parts.push(
    'mkdir -p "$ROOT/app/src/main/java/' +
      pkgPath +
      '" "$ROOT/app/src/main/res/layout" "$ROOT/app/src/main/res/values" "$ROOT/gradle/wrapper"',
  );
  // When REUSE=1 skip rewriting sources (preserve user/LLM customizations)
  parts.push('if [ "$REUSE" = "0" ]; then');
  parts.push(
    'SDK=""; for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$PREFIX/opt/android-sdk" "$PREFIX/share/android-sdk" "$PREFIX/lib/android-sdk"; do ' +
      '[ -n "$d" ] && { [ -d "$d/platforms" ] && [ -n "$(ls -A "$d/platforms" 2>/dev/null)" ] || [ -d "$d/build-tools" ]; } && SDK="$d" && break; done',
  );
  parts.push(
    'if [ -z "$SDK" ]; then echo "ERROR: Android SDK missing ($PREFIX/opt/android-sdk)" >&2; exit 1; fi',
  );
  parts.push('export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"');
  parts.push('echo "sdk.dir=$SDK" > "$ROOT/local.properties"');
  parts.push(
    'COMPILE_SDK=34; ' +
      'if [ ! -f "$SDK/platforms/android-34/android.jar" ]; then ' +
      '  _cs=$(ls -1 "$SDK/platforms" 2>/dev/null | sed -n "s/^android-//p" | sort -n | tail -1); ' +
      '  [ -n "$_cs" ] && COMPILE_SDK="$_cs"; fi; echo "COMPILE_SDK=$COMPILE_SDK"',
  );
  parts.push(
    'JH=""; for d in "$PREFIX/lib/jvm/java-17-openjdk" "$PREFIX/lib/jvm/java-21-openjdk" "$PREFIX/lib/jvm/java-21-openjdk-aarch64" "$PREFIX/lib/jvm/java-17-openjdk-amd64"; do ' +
      '[ -x "$d/bin/java" ] && JH="$d" && break; done',
  );
  parts.push('[ -n "$JH" ] && export JAVA_HOME="$JH" && export PATH="$JAVA_HOME/bin:$PATH"');
  parts.push('java -version 2>&1 | head -1 || { echo "ERROR: java missing" >&2; exit 1; }');
  parts.push(
    "printf '%s\\n' " +
      "'org.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8' " +
      "'android.useAndroidX=true' " +
      "'android.nonTransitiveRClass=true' " +
      "'org.gradle.daemon=false' " +
      "'org.gradle.parallel=false' > \"$ROOT/gradle.properties\"",
  );
  // aapt2FromMavenOverride: avoid Permission denied when AGP extracts aapt2 onto noexec /storage
  parts.push(
    'AAPT2=$(ls "$SDK/build-tools"/*/aapt2 2>/dev/null | tail -1); ' +
      '[ -z "$AAPT2" ] && AAPT2=$(command -v aapt2 2>/dev/null || true); ' +
      'if [ -n "$AAPT2" ]; then ' +
      '  chmod +x "$AAPT2" 2>/dev/null || true; ' +
      '  printf "\\nandroid.aapt2FromMavenOverride=%s\\n" "$AAPT2" >> "$ROOT/gradle.properties"; ' +
      '  echo "aapt2_override=$AAPT2"; ' +
      'fi',
  );
  parts.push(
    "printf '%s\\n' " +
      "'pluginManagement { repositories { google(); mavenCentral(); gradlePluginPortal() } }' " +
      "'dependencyResolutionManagement { repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS); repositories { google(); mavenCentral() } }' " +
      "'rootProject.name = \"" +
      safe +
      "\"' " +
      "'include \":app\"' > \"$ROOT/settings.gradle\"",
  );
  parts.push(
    "printf '%s\\n' " +
      "'buildscript { repositories { google(); mavenCentral() }; dependencies { classpath \"com.android.tools.build:gradle:8.2.2\" } }' " +
      "'task clean(type: Delete) { delete rootProject.buildDir }' > \"$ROOT/build.gradle\"",
  );
  // Write app/build.gradle with placeholder COMPILE_SDK then sed
  parts.push(
    "printf '%s\\n' " +
      "'apply plugin: \"com.android.application\"' " +
      "'android {' " +
      "'  namespace \"" +
      pkg +
      "\"' " +
      "'  compileSdk __COMPILE_SDK__' " +
      "'  defaultConfig {' " +
      "'    applicationId \"" +
      pkg +
      "\"' " +
      "'    minSdk 24' " +
      "'    targetSdk __COMPILE_SDK__' " +
      "'    versionCode 1' " +
      "'    versionName \"1.0\"' " +
      "'  }' " +
      "'  compileOptions {' " +
      "'    sourceCompatibility JavaVersion.VERSION_17' " +
      "'    targetCompatibility JavaVersion.VERSION_17' " +
      "'  }' " +
      "'}' " +
      "'dependencies {}' > \"$ROOT/app/build.gradle\"",
  );
  parts.push('sed -i "s/__COMPILE_SDK__/$COMPILE_SDK/g" "$ROOT/app/build.gradle"');
  parts.push(
    "printf '%s\\n' " +
      "'<manifest xmlns:android=\"http://schemas.android.com/apk/res/android\">' " +
      "'  <application android:label=\"" +
      safe +
      "\" android:theme=\"@android:style/Theme.DeviceDefault.Light\">' " +
      "'    <activity android:name=\".MainActivity\" android:exported=\"true\">' " +
      "'      <intent-filter>' " +
      "'        <action android:name=\"android.intent.action.MAIN\"/>' " +
      "'        <category android:name=\"android.intent.category.LAUNCHER\"/>' " +
      "'      </intent-filter>' " +
      "'    </activity>' " +
      "'  </application>' " +
      "'</manifest>' > \"$ROOT/app/src/main/AndroidManifest.xml\"",
  );
  parts.push(
    "printf '%s\\n' " +
      "'<?xml version=\"1.0\" encoding=\"utf-8\"?>' " +
      "'<LinearLayout xmlns:android=\"http://schemas.android.com/apk/res/android\"' " +
      "'  android:orientation=\"vertical\" android:gravity=\"center\"' " +
      "'  android:layout_width=\"match_parent\" android:layout_height=\"match_parent\">' " +
      "'  <TextView android:id=\"@+id/hello\" android:layout_width=\"wrap_content\"' " +
      "'    android:layout_height=\"wrap_content\" android:text=\"" +
      safe +
      "\" android:textSize=\"24sp\"/>' " +
      "'</LinearLayout>' > \"$ROOT/app/src/main/res/layout/activity_main.xml\"",
  );
  parts.push(
    "printf '%s\\n' '<resources><string name=\"app_name\">" +
      safe +
      "</string></resources>' > \"$ROOT/app/src/main/res/values/strings.xml\"",
  );
  parts.push(
    "printf '%s\\n' " +
      "'package " +
      pkg +
      ";' " +
      "'import android.app.Activity;' " +
      "'import android.os.Bundle;' " +
      "'import android.widget.TextView;' " +
      "'public class MainActivity extends Activity {' " +
      "'  @Override protected void onCreate(Bundle b) {' " +
      "'    super.onCreate(b);' " +
      "'    setContentView(R.layout.activity_main);' " +
      "'    TextView tv = findViewById(R.id.hello);' " +
      "'    if (tv != null) tv.setText(\"" +
      safe +
      "\");' " +
      "'  }' " +
      "'}' > \"$ROOT/app/src/main/java/" +
      pkgPath +
      "/MainActivity.java\"",
  );
  parts.push(
    "printf '%s\\n' " +
      "'distributionBase=GRADLE_USER_HOME' " +
      "'distributionPath=wrapper/dists' " +
      "'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2-bin.zip' " +
      "'networkTimeout=120000' " +
      "'zipStoreBase=GRADLE_USER_HOME' " +
      "'zipStorePath=wrapper/dists' > \"$ROOT/gradle/wrapper/gradle-wrapper.properties\"",
  );
  parts.push(
    "printf '%s\\n' " +
      "'#!/usr/bin/env bash' " +
      "'DIR=$(CDPATH= cd -- \"$(dirname \"$0\")\" && pwd)' " +
      "'JAR=\"$DIR/gradle/wrapper/gradle-wrapper.jar\"' " +
      "'if [ ! -f \"$JAR\" ]; then echo \"NO_WRAPPER_JAR: $JAR\" >&2; exit 1; fi' " +
      "'exec java -classpath \"$JAR\" org.gradle.wrapper.GradleWrapperMain \"$@\"' > \"$ROOT/gradlew\"",
  );
  parts.push('chmod 755 "$ROOT/gradlew"');
  // Wrapper jar recovery: cache paths, find, gradle wrapper, last-resort curl
  parts.push(
    'JAR=""; for c in "$PREFIX/opt/aibuilder-toolpack/gradle/wrapper/gradle-wrapper.jar" ' +
      '"$HOME/.aibuilder/gradle-wrapper.jar" ' +
      '"$PREFIX/share/gradle/lib/plugins/gradle-wrapper-shared-*.jar"; do ' +
      'for f in $c; do [ -f "$f" ] && JAR="$f" && break 2; done; done; ' +
      'if [ -z "$JAR" ]; then JAR=$(find "$PREFIX" "$HOME" -name gradle-wrapper.jar -type f 2>/dev/null | head -1); fi; ' +
      'if [ -n "$JAR" ]; then cp -f "$JAR" "$ROOT/gradle/wrapper/gradle-wrapper.jar"; ' +
      'elif command -v gradle >/dev/null 2>&1; then (cd "$ROOT" && gradle wrapper --gradle-version 8.2 2>&1 | tail -20) || true; fi; ' +
      'if [ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ]; then ' +
      '  URL="https://github.com/gradle/gradle/raw/v8.2.0/gradle/wrapper/gradle-wrapper.jar"; ' +
      '  if command -v curl >/dev/null 2>&1; then curl -fsSL -o "$ROOT/gradle/wrapper/gradle-wrapper.jar" "$URL" 2>/dev/null || true; fi; ' +
      '  if [ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ] && command -v wget >/dev/null 2>&1; then ' +
      '    wget -q -O "$ROOT/gradle/wrapper/gradle-wrapper.jar" "$URL" 2>/dev/null || true; fi; fi; ' +
      'if [ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ]; then ' +
      '  echo "ERROR: gradle-wrapper.jar missing — install gradle (pkg install gradle) or tool-pack" >&2; exit 1; fi',
  );
  parts.push('fi'); // end REUSE=0 scaffold writes
  // Always refresh SDK env + local.properties (reuse and fresh)
  parts.push(
    'SDK=""; for d in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}" "$PREFIX/opt/android-sdk" "$PREFIX/share/android-sdk" "$PREFIX/lib/android-sdk"; do ' +
      '[ -n "$d" ] && { [ -d "$d/platforms" ] && [ -n "$(ls -A "$d/platforms" 2>/dev/null)" ] || [ -d "$d/build-tools" ]; } && SDK="$d" && break; done',
  );
  parts.push(
    'if [ -z "$SDK" ]; then echo "ERROR: Android SDK missing ($PREFIX/opt/android-sdk)" >&2; exit 1; fi',
  );
  parts.push('export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"');
  parts.push('echo "sdk.dir=$SDK" > "$ROOT/local.properties"');
  parts.push(
    'JH=""; for d in "$PREFIX/lib/jvm/java-17-openjdk" "$PREFIX/lib/jvm/java-21-openjdk" "$PREFIX/lib/jvm/java-21-openjdk-aarch64" "$PREFIX/lib/jvm/java-17-openjdk-amd64"; do ' +
      '[ -x "$d/bin/java" ] && JH="$d" && break; done',
  );
  parts.push('[ -n "$JH" ] && export JAVA_HOME="$JH" && export PATH="$JAVA_HOME/bin:$PATH"');
  parts.push(
    'if [ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.jar" ]; then ' +
      'mkdir -p "$ROOT/gradle/wrapper"; WJAR=""; ' +
      'for c in "$PREFIX/opt/aibuilder-toolpack/gradle/wrapper/gradle-wrapper.jar" "$HOME/.aibuilder/gradle-wrapper.jar"; do [ -f "$c" ] && WJAR="$c" && break; done; ' +
      '[ -z "$WJAR" ] && WJAR=$(find "$PREFIX" "$HOME" -name gradle-wrapper.jar -type f 2>/dev/null | head -1); ' +
      '[ -n "$WJAR" ] && cp -f "$WJAR" "$ROOT/gradle/wrapper/gradle-wrapper.jar" && echo "wrapper_restored=$WJAR"; fi',
  );
  // Ensure gradlew launcher exists (reuse projects may miss it)
  parts.push(
    'if [ ! -f "$ROOT/gradlew" ]; then ' +
    "printf '%s\\n' " +
      "'#!/usr/bin/env bash' " +
      "'DIR=$(CDPATH= cd -- \"$(dirname \"$0\")\" && pwd)' " +
      "'JAR=\"$DIR/gradle/wrapper/gradle-wrapper.jar\"' " +
      "'if [ ! -f \"$JAR\" ]; then echo \"NO_WRAPPER_JAR: $JAR\" >&2; exit 1; fi' " +
      "'exec java -classpath \"$JAR\" org.gradle.wrapper.GradleWrapperMain \"$@\"' > \"$ROOT/gradlew\"; " +
      'fi; chmod 755 "$ROOT/gradlew"',
  );
  parts.push(
    'if [ ! -f "$ROOT/gradle/wrapper/gradle-wrapper.properties" ]; then ' +
    "printf '%s\\n' " +
      "'distributionBase=GRADLE_USER_HOME' " +
      "'distributionPath=wrapper/dists' " +
      "'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.2-bin.zip' " +
      "'networkTimeout=120000' " +
      "'zipStoreBase=GRADLE_USER_HOME' " +
      "'zipStorePath=wrapper/dists' > \"$ROOT/gradle/wrapper/gradle-wrapper.properties\"; fi",
  );
  parts.push('export GRADLE_USER_HOME="${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}"');
  parts.push('mkdir -p "$GRADLE_USER_HOME"');
  // Always inject/refresh aapt2 override (REUSE path may have old gradle.properties without it)
  parts.push(
    'AAPT2=$(ls "$SDK/build-tools"/*/aapt2 2>/dev/null | tail -1); ' +
      '[ -z "$AAPT2" ] && AAPT2=$(command -v aapt2 2>/dev/null || true); ' +
      'if [ -n "$AAPT2" ]; then ' +
      '  chmod +x "$AAPT2" 2>/dev/null || true; ' +
      '  if [ -f "$ROOT/gradle.properties" ] && grep -q "^android.aapt2FromMavenOverride=" "$ROOT/gradle.properties" 2>/dev/null; then ' +
      '    sed -i "s|^android.aapt2FromMavenOverride=.*|android.aapt2FromMavenOverride=$AAPT2|" "$ROOT/gradle.properties"; ' +
      '  else ' +
      '    printf "\\nandroid.aapt2FromMavenOverride=%s\\n" "$AAPT2" >> "$ROOT/gradle.properties"; ' +
      '  fi; ' +
      '  echo "aapt2_override=$AAPT2"; ' +
      'fi',
  );
  parts.push(
    'cd "$ROOT"; ' +
      'LOCKDIR="${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}/.aib-build.lockdir"; ' +
      'if [ -d "$LOCKDIR" ]; then ' +
      '  LOCK_AGE=$(( $(date +%s) - $(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0) )); ' +
      '  GRADLE_ALIVE=0; pgrep -f "[Gg]radle|GradleDaemon" >/dev/null 2>&1 && GRADLE_ALIVE=1; ' +
      '  if [ "$LOCK_AGE" -gt 2700 ] || { [ "$LOCK_AGE" -gt 600 ] && [ "$GRADLE_ALIVE" -eq 0 ]; }; then ' +
      '    echo "STALE_BUILD_LOCK age=${LOCK_AGE}s gradle_alive=$GRADLE_ALIVE — clearing"; rm -rf "$LOCKDIR"; fi; fi; ' +
      'if ! mkdir "$LOCKDIR" 2>/dev/null; then waited=0; while [ $waited -lt 120 ]; do sleep 5; waited=$((waited+5)); ' +
      '  if [ -d "$LOCKDIR" ]; then ' +
      '    LA=$(( $(date +%s) - $(stat -c %Y "$LOCKDIR" 2>/dev/null || echo 0) )); ' +
      '    GA=0; pgrep -f "[Gg]radle|GradleDaemon" >/dev/null 2>&1 && GA=1; ' +
      '    if [ "$LA" -gt 2700 ] || { [ "$LA" -gt 600 ] && [ "$GA" -eq 0 ]; }; then rm -rf "$LOCKDIR"; fi; fi; ' +
      '  mkdir "$LOCKDIR" 2>/dev/null && break; done; fi; ' +
      'if [ ! -d "$LOCKDIR" ]; then echo "BUILD_LOCK_TIMEOUT" >&2; exit 40; fi; ' +
      'trap "rmdir \"$LOCKDIR\" 2>/dev/null || true" EXIT; ' +
      'AAPT2_FLAG=""; [ -n "$AAPT2" ] && AAPT2_FLAG="-Pandroid.aapt2FromMavenOverride=$AAPT2"; ' +
      'bash gradlew assembleDebug --no-daemon --max-workers=2 --stacktrace -Dorg.gradle.jvmargs="-Xmx1536m -XX:MaxMetaspaceSize=384m -Dfile.encoding=UTF-8" $AAPT2_FLAG 2>&1',
  );
  parts.push(
    'APK=$(find "$ROOT/app/build/outputs/apk/release" "$ROOT/app/build/outputs/apk/debug" "$ROOT/app/build/outputs/apk" -type f -name "*.apk" 2>/dev/null | while read -r f; do ' +
      'printf "%s\t%s\n" "$(stat -c %Y "$f" 2>/dev/null || echo 0)" "$f"; done | sort -nr | head -1 | cut -f2-); ' +
      'if [ -z "$APK" ]; then APK=$(find "$ROOT" -type f -name "*.apk" 2>/dev/null | while read -r f; do ' +
      'printf "%s\t%s\n" "$(stat -c %Y "$f" 2>/dev/null || echo 0)" "$f"; done | sort -nr | head -1 | cut -f2-); fi',
  );
  parts.push(
    'if [ -n "$APK" ] && [ -f "$APK" ]; then SZ=$(wc -c < "$APK" | tr -d " "); ' +
      'if [ "$SZ" -lt 8192 ]; then echo "ERROR: APK too small (${SZ} bytes)" >&2; exit 1; fi; ' +
      'echo "AIB_DETERMINISTIC_APK=$APK"; echo "AIB_APK_SIZE=$SZ"; ls -la "$APK"; ' +
      'else echo "ERROR: no APK after assembleDebug" >&2; find "$ROOT" -name "*.apk" 2>/dev/null | head -10; exit 1; fi',
  );
  return parts.join("; ");
}


export async function ensureAndroidToolchain(timeoutMs = 600_000): Promise<{
  ok: boolean;
  log: string;
}> {
  const cmd = [
    "set +e",
    'echo "AIB_TOOLCHAIN_START"',
    'pkg update -y >/dev/null 2>&1 || true',
    'if ! command -v java >/dev/null 2>&1; then pkg install -y openjdk-17 2>&1 | tail -12; fi',
    'JH=""; for d in "$PREFIX/lib/jvm/java-17-openjdk" "$PREFIX/lib/jvm/java-21-openjdk"; do [ -x "$d/bin/java" ] && JH="$d" && break; done',
    '[ -n "$JH" ] && export JAVA_HOME="$JH" && export PATH="$JAVA_HOME/bin:$PATH"',
    'java -version 2>&1 | head -1 || echo java=MISSING',
    'if ! command -v gradle >/dev/null 2>&1; then pkg install -y gradle 2>&1 | tail -12; fi',
    'if command -v gradle >/dev/null 2>&1; then GV=$(gradle --version 2>&1 | head -3); if echo "$GV" | grep -qi Gradle; then echo "gradle=OK:$GV"; else pkg install -y --reinstall gradle 2>&1 | tail -8; GV=$(gradle --version 2>&1 | head -2); echo "gradle=RETRY:$GV"; fi; else echo gradle=MISSING; fi',
    'SDK="${ANDROID_HOME:-$PREFIX/opt/android-sdk}"',
    'if [ ! -d "$SDK" ]; then pkg install -y android-sdk 2>&1 | tail -12 || true; SDK="${ANDROID_HOME:-$PREFIX/opt/android-sdk}"; fi',
    'export ANDROID_HOME="$SDK" ANDROID_SDK_ROOT="$SDK"',
    'mkdir -p "$SDK/licenses" "$SDK/platforms" "$SDK/build-tools" 2>/dev/null || true',
    'printf "%s\\n" "24333f8a63b6825ea9c5514f83c2829b004d1fee" > "$SDK/licenses/android-sdk-license" 2>/dev/null || true',
    'printf "%s\\n" "84831b9409646a918e30573bab4c9c91346d8abd" > "$SDK/licenses/android-sdk-preview-license" 2>/dev/null || true',
    'if [ ! -f "$SDK/platforms/android-34/android.jar" ] && command -v sdkmanager >/dev/null 2>&1; then',
    '  yes | sdkmanager "platforms;android-34" "build-tools;34.0.0" 2>&1 | tail -15 || true',
    'fi',
    'if ! ls "$SDK/platforms"/android-*/android.jar >/dev/null 2>&1 && command -v sdkmanager >/dev/null 2>&1; then',
    '  for api in 35 33 32 31; do yes | sdkmanager "platforms;android-$api" "build-tools;$api.0.0" 2>&1 | tail -6 || true; ls "$SDK/platforms"/android-*/android.jar >/dev/null 2>&1 && break; done',
    'fi',
    'if [ ! -d "$SDK/platforms" ] || [ -z "$(ls -A "$SDK/platforms" 2>/dev/null)" ]; then echo sdk_platforms=MISSING; elif ! ls "$SDK/platforms"/android-*/android.jar >/dev/null 2>&1; then echo sdk_platforms=MISSING; else echo "sdk_dir=$SDK"; ls "$SDK/platforms" 2>/dev/null | head -5; fi',
    'BT=$(ls -d "$SDK/build-tools"/*/ 2>/dev/null | tail -1)',
    'if [ -z "$BT" ] || [ ! -x "${BT}aapt2" ]; then',
    '  if command -v sdkmanager >/dev/null 2>&1; then yes | sdkmanager "build-tools;34.0.0" "platforms;android-34" 2>&1 | tail -10 || true; fi',
    '  BT=$(ls -d "$SDK/build-tools"/*/ 2>/dev/null | tail -1)',
    'fi',
    'if [ -n "$BT" ] && [ -x "${BT}aapt2" ]; then echo "aapt2=OK:${BT}aapt2"; else echo aapt2=MISSING; fi',
    'if command -v gradle >/dev/null 2>&1; then gradle --version 2>&1 | head -2 || echo gradle=BROKEN; else echo gradle=MISSING; fi',
    'echo "AIB_TOOLCHAIN_END"',
  ].join("; ");
  try {
    const r = await executeGuardedTermuxCommand(cmd, {
      timeoutMs,
      isBuild: true,
      trustedInternal: true,
    });
    const log = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
    const ok =
      /AIB_TOOLCHAIN_END/.test(log) &&
      !/java=MISSING/.test(log) &&
      !/aapt2=MISSING/.test(log) &&
      !/sdk_platforms=MISSING/.test(log);
    persistentLogger.add(
      ok ? "info" : "warn",
      "AgentEngine",
      `ensureAndroidToolchain ok=${ok} exit=${r.exitCode}`,
    );
    return { ok, log: log.slice(0, 6000) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", "AgentEngine", `ensureAndroidToolchain: ${msg}`);
    return { ok: false, log: msg };
  }
}

export async function runDeterministicCreateApp(
  appName: string,
  packageName: string,
  timeoutMs = 1_200_000,
  opts?: { forceFresh?: boolean },
): Promise<{ ok: boolean; apkPath: string | null; log: string }> {
  const script = buildDeterministicCreateAppScript(appName, packageName, opts);
  try {
    const r = await executeGuardedTermuxCommand(script, {
      timeoutMs,
      isBuild: true,
      trustedInternal: true,
    });
    const log = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
    const m = log.match(/AIB_DETERMINISTIC_APK=(.+)/);
    const apkPath = m ? m[1].trim() : null;
    const ok = r.exitCode === 0 && !!apkPath;
    persistentLogger.add(
      ok ? "info" : "warn",
      "AgentEngine",
      `deterministic create-app ${appName} ok=${ok} apk=${apkPath || "none"}`,
    );
    return { ok, apkPath, log: log.slice(0, 8000) };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, apkPath: null, log: msg };
  }
}

/** Map build failure text → repair recipe id (or null). */
export function classifyBuildError(stdout: string, stderr: string): string | null {
  const t = `${stdout}\n${stderr}`.toLowerCase();
  if (/unsupported class file major version|invalid source release|javaversion/i.test(t)) {
    return "java-install";
  }
  if (
    /gradle[-\s]?wrapper|could not find or load main class org.gradle|gradlew: not found|no_wrapper_jar|gradle-wrapper\.jar missing/i.test(
      t,
    )
  ) {
    return "gradle-pkg";
  }
  if (/sdk location not found|android_home|sdk.dir|license not accepted/i.test(t)) {
    return "local-properties";
  }
  if (/aapt2|aapt\b|png crunch|resource linking/i.test(t)) {
    return "aapt2-sdk";
  }
  if (/cannot find symbol|package android\./i.test(t) && /compile/i.test(t)) {
    return "local-properties";
  }
  if (/ndk|cmake|clang\+\+/i.test(t) && /failed/i.test(t)) {
    return "ndk-path";
  }
  if (/pnpm|npm err|yarn|enoent.*node_modules/i.test(t)) {
    return "nodejs";
  }
  if (/could not resolve|failed to download|connection (refused|reset)|unknown host/i.test(t)) {
    return "wget-curl";
  }
  if (/out of memory|outofmemory|cannot allocate memory|enomem|gc overhead limit|daemon disappeared|process .* killed|signal 9|sigkill|low memory|memory pressure/i.test(t)) {
    return "gradle-cache";
  }
  return null;
}

export async function tryAutoRepair(
  recipeId: string,
): Promise<{ ok: boolean; message: string }> {
  try {
    const rr = await runRepairRecipe(recipeId, { allowMedium: true });
    return {
      ok: !!rr.ok,
      message: (rr.stdout || rr.message || rr.stderr || "").slice(0, 2000),
    };
  } catch (e: unknown) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** Toolchain → scaffold; if fail due to tools, repair once and scaffold again. */
export async function runCreateAppWithRetry(
  appName: string,
  packageName: string,
  timeoutMs = 1_200_000,
  opts?: { forceFresh?: boolean },
): Promise<{ ok: boolean; apkPath: string | null; log: string }> {
  const tc1 = await ensureAndroidToolchain(Math.min(timeoutMs, 600_000));
  let det = await runDeterministicCreateApp(appName, packageName, timeoutMs, opts);
  if (det.ok && det.apkPath) {
    return { ok: true, apkPath: det.apkPath, log: tc1.log + "\n" + det.log };
  }
  const recipe =
    classifyBuildError(det.log, det.log) ||
    (/aapt2=MISSING|sdk_platforms=MISSING/i.test(tc1.log + det.log) ? "aapt2-sdk" : null) ||
    (/java=MISSING/i.test(tc1.log) ? "java-install" : null) ||
    (/gradle=MISSING/i.test(tc1.log) ? "gradle-pkg" : null);
  if (recipe) {
    persistentLogger.add("info", "AgentEngine", `create-app retry after recipe=${recipe}`);
    await tryAutoRepair(recipe);
    await ensureAndroidToolchain(Math.min(timeoutMs, 600_000));
    det = await runDeterministicCreateApp(appName, packageName, timeoutMs, opts);
  }
  return {
    ok: !!(det.ok && det.apkPath),
    apkPath: det.apkPath,
    log: (tc1.log + "\n" + det.log).slice(0, 12000),
  };
}


/** Prompt fragment: tools first, shell last. */
export const TOOLS_FIRST_PROTOCOL = `
[PROTOCOL — TOOLS FIRST]
Prefer structured tools over free bash. Reply with EXACTLY one of:

AIB_TOOL:
{"tool":"fs.create","args":{"path":"/storage/emulated/0/AIBuilderTermux/App/file.java","content":"..."}}

AIB_TOOL:
{"tool":"toolchain.ensure","args":{}}

AIB_TOOL:
{"tool":"build.run","args":{"command":"cd /storage/emulated/0/AIBuilderTermux/App && bash gradlew assembleDebug --no-daemon --stacktrace"}}

TERMUX_RUN:
<single bash command>

TERMUX_DONE:
<short summary with absolute .apk path if built>

Rules:
- For multi-file projects use several AIB_TOOL fs.create (or one TERMUX_RUN that runs a .sh you already wrote).
- Do NOT claim BUILD SUCCESSFUL without a real [TERMUX_RESULT] exit 0 and .apk path.
- Prefer fixing via repair recipes / re-run assemble, not long explanations.
`.trim();
