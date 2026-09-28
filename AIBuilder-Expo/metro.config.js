const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

config.watchFolders = [__dirname];
config.resolver = {
  ...config.resolver,
  disableHierarchicalLookup: false,
  blockList: [
    ...(Array.isArray(config.resolver?.blockList)
      ? config.resolver.blockList
      : config.resolver?.blockList
        ? [config.resolver.blockList]
        : []),
    /\/node_modules\/.+\/build\//,
    /\/\.expo\/.*\//,
  ],
};

module.exports = config;
