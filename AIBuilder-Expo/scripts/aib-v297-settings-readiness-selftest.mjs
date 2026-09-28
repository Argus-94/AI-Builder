import fs from "node:fs";

const source = fs.readFileSync(new URL("../app/settings.tsx", import.meta.url), "utf8");

for (const token of [
  'useFocusEffect',
  'refreshPackReadinessState',
  'checkTermuxReadiness({ deep: true })',
  'setPacksBridgeOk(isNativeModuleAvailable())',
  'setPacksReady(r.ready)',
]) {
  if (!source.includes(token)) throw new Error(`missing settings readiness token: ${token}`);
}

if (!source.includes('useFocusEffect(\n    useCallback(() => refreshPackReadinessState(), [refreshPackReadinessState])\n  );')) {
  throw new Error('Settings screen does not recheck Termux readiness on focus');
}

console.log('AIB_V297_SETTINGS_READINESS_SELFTEST_OK');
