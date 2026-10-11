const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

// llama.rn (README, раздел Android) просит добавить keep-правило в
// proguard-rules.pro, если в проекте включена минификация для релизных
// сборок. По умолчанию в managed Expo-проектах proguard выключен, поэтому
// это безопасное дополнение "на будущее" — если правило уже есть, ничего
// не дублируем.
const RULE = "# llama.rn\n-keep class com.rnllama.** { *; }\n";

function withLlamaRnProguard(config) {
  return withDangerousMod(config, [
    "android",
    async (config) => {
      const proguardPath = path.join(
        config.modRequest.platformProjectRoot,
        "app/proguard-rules.pro"
      );
      if (!fs.existsSync(proguardPath)) return config;
      const text = fs.readFileSync(proguardPath, "utf8");
      if (text.includes("com.rnllama")) return config;
      fs.writeFileSync(proguardPath, `${text}\n${RULE}`, "utf8");
      return config;
    },
  ]);
}

module.exports = withLlamaRnProguard;
