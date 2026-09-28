const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Делает Android-проект, сгенерированный Expo, самодостаточным для AGP 8+:
 * включаем генерацию BuildConfig, задаём единые namespace/applicationId и
 * синхронизируем package-директивы Kotlin с android.package.
 *
 * Плагин намеренно работает как dangerous mod: CBE запускает prebuild --clean,
 * поэтому правки применяются к свежесгенерированному проекту на каждой сборке.
 * 
 * Защита от дублирования: проверяем наличие каждого флага перед вставкой.
 */
function withEnsureBuildConfig(config) {
  const androidPackage = config.android?.package || "com.sakana.aibuilder";

  return withDangerousMod(config, ["android", async (config) => {
    const root = config.modRequest.platformProjectRoot;
    const buildGradlePath = path.join(root, "app", "build.gradle");

    if (fs.existsSync(buildGradlePath)) {
      let text = fs.readFileSync(buildGradlePath, "utf8");
      let modified = false;

      // AGP 8+ требует явного buildConfig true
      if (!/buildFeatures\s*\{[\s\S]*?\bbuildConfig\s+true\b/.test(text)) {
        if (/buildFeatures\s*\{/.test(text)) {
          text = text.replace(/buildFeatures\s*\{/, (match) => `${match}\n        buildConfig true`);
        } else if (/android\s*\{/.test(text)) {
          text = text.replace(/android\s*\{/, (match) => `${match}\n    buildFeatures {\n        buildConfig true\n    }`);
        }
        modified = true;
      }

      // Синхронизируем namespace (один раз)
      if (/namespace\s*(?:=\s*)?["'][^"']+["']/.test(text)) {
        const oldLen = text.length;
        text = text.replace(/namespace\s*(?:=\s*)?["'][^"']+["']/, `namespace "${androidPackage}"`);
        if (text.length !== oldLen) modified = true;
      } else if (/android\s*\{/.test(text)) {
        const oldLen = text.length;
        text = text.replace(/android\s*\{/, (match) => `${match}\n    namespace "${androidPackage}"`);
        if (text.length !== oldLen) modified = true;
      }

      // Синхронизируем applicationId (один раз)
      if (/defaultConfig\s*\{[\s\S]*?applicationId\s+["'][^"']+["']/.test(text)) {
        const oldLen = text.length;
        text = text.replace(
          /applicationId\s+["'][^"']+["']/,
          `applicationId "${androidPackage}"`
        );
        if (text.length !== oldLen) modified = true;
      } else if (/defaultConfig\s*\{/.test(text)) {
        const oldLen = text.length;
        text = text.replace(/defaultConfig\s*\{/, (match) => `${match}\n        applicationId "${androidPackage}"`);
        if (text.length !== oldLen) modified = true;
      }

      // Отключаем встраивание JS бандла в debug (для standalone APK)
      if (!/debuggableVariants\s*=\s*\[\s*\]/.test(text) && /react\s*\{/.test(text)) {
        const oldLen = text.length;
        text = text.replace(/react\s*\{/, "react {\n        debuggableVariants = []");
        if (text.length !== oldLen) modified = true;
      }

      if (modified) {
        fs.writeFileSync(buildGradlePath, text, "utf8");
      }
    }

    // Синхронизируем package директивы в .java и .kt файлах (КРИТИЧНО для AGP 8+)
    const javaRoot = path.join(root, "app", "src", "main", "java");
    if (fs.existsSync(javaRoot)) {
      const walk = (dir) => {
        try {
          for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const fullPath = path.join(dir, entry.name);
            if (entry.isDirectory()) {
              walk(fullPath);
            } else if (/\.(kt|java)$/.test(entry.name)) {
              let source = fs.readFileSync(fullPath, "utf8");
              if (!/^package\s+/m.test(source)) continue;
              
              const isJava = entry.name.endsWith(".java");
              const packageLine = isJava
                ? `package ${androidPackage};`
                : `package ${androidPackage}`;
              
              const next = source.replace(/^package\s+[^\r\n;]+;?/m, packageLine);
              if (next !== source) {
                fs.writeFileSync(fullPath, next, "utf8");
              }
            }
          }
        } catch (e) {
          console.warn(`[withEnsureBuildConfig] Warning while walking ${dir}: ${e.message}`);
        }
      };
      walk(javaRoot);
    }

    return config;
  }]);
}

module.exports = withEnsureBuildConfig;
