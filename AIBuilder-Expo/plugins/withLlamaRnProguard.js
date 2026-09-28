const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// llama.rn требует keep-правило в proguard-rules.pro для release сборок.
// Защита от дублирования: проверяем наличие правила перед добавлением.
const RULE = "-keep class com.rnllama.** { *; }\n-keep class com.rnllama.RNLlamaContextModule { *; }\n";

function withLlamaRnProguard(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      try {
        const proguardPath = path.join(
          config.modRequest.platformProjectRoot,
          "app/proguard-rules.pro"
        );
        
        if (!fs.existsSync(proguardPath)) {
          // Создаём файл если не существует
          fs.writeFileSync(proguardPath, `# Proguard rules for llama.rn\n${RULE}`, "utf8");
          return config;
        }

        const text = fs.readFileSync(proguardPath, "utf8");
        
        // Проверяем наличие любого правила для llama.rn
        if (text.includes("com.rnllama")) {
          return config;
        }

        // Добавляем правило только один раз
        const newContent = text.endsWith("\n") ? text : text + "\n";
        fs.writeFileSync(proguardPath, newContent + RULE, "utf8");
      } catch (e) {
        console.warn(`[withLlamaRnProguard] Warning: ${e.message}`);
      }

      return config;
    },
  ]);
}

module.exports = withLlamaRnProguard;
