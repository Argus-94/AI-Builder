#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const plugin = read('plugins/withTermuxBridge.js');
const config = read('app.config.ts');
const bridge = read('lib/termux-bridge.ts');
const settings = read('app/settings.tsx');
const context = read('components/TermuxContext.tsx');
const policy = read('docs/A04_STORAGE_POLICY.md');

const forbiddenManifest = [
  'android.permission.MANAGE_EXTERNAL_STORAGE',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
for (const token of forbiddenManifest) {
  if (plugin.includes(`addPermission("${token}")`)) {
    throw new Error(`FORBIDDEN_PERMISSION_DECLARED ${token}`);
  }
  if (config.includes(`"${token}"`)) {
    throw new Error(`FORBIDDEN_PERMISSION_CONFIGURED ${token}`);
  }
}

for (const token of ['TermuxResultReceiver', 'TermuxResultStore', 'com.termux.RUN_COMMAND_PENDING_INTENT', 'getBundleExtra("result")']) {
  if (!plugin.includes(token)) throw new Error(`MISSING_TERMUX_CALLBACK ${token}`);
}

for (const token of ['hasAllFilesAccess', 'openAllFilesAccessSettings', 'all_files_access_missing']) {
  if (bridge.includes(token) || context.includes(token)) {
    throw new Error(`LEGACY_ALL_FILES_FLOW ${token}`);
  }
}

if (/ensureStoragePermission|WRITE_EXTERNAL_STORAGE/.test(settings)) {
  throw new Error('LEGACY_STORAGE_PERMISSION_FLOW_IN_SETTINGS');
}

for (const token of ['MANAGE_EXTERNAL_STORAGE`: **not declared / not requested**', 'PendingIntent', 'REQUEST_INSTALL_PACKAGES']) {
  if (!policy.includes(token)) throw new Error(`POLICY_DOC_MISSING ${token}`);
}

console.log('AIB_STORAGE_PERMISSION_SELFTEST_OK');
