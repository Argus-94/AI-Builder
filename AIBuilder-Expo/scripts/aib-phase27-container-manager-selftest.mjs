#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
const root = process.cwd();
const required = [
  'core/container/ProotContainerManager.ts',
  'core/container/ContainerProfiles.ts',
  'core/RuntimeFacade.ts',
  'app/runtime.tsx',
];
for (const file of required) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`MISSING:${file}`);
}
const manager = fs.readFileSync(path.join(root, 'core/container/ProotContainerManager.ts'), 'utf8');
const facade = fs.readFileSync(path.join(root, 'core/RuntimeFacade.ts'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'app/runtime.tsx'), 'utf8');
for (const token of ['ProotContainerManager','containerCreate','containerExec','proot-distro','CONTAINER_COMMAND_NOT_ALLOWED','CONTAINER_CWD_MUST_BE_WORKSPACE','--bind','normalizedMounts','PROOT_PROFILE_NOT_READY','validateProjectName','CONTAINER_MOUNT_HOST_OUTSIDE_PROJECTS']) {
  if (!manager.includes(token) && !facade.includes(token)) throw new Error(`CONTRACT:${token}`);
}
const runtimeI18n = fs.readFileSync(path.join(root, 'lib/runtime-i18n.ts'), 'utf8');
for (const token of ['createStartDebian','containerManager']) { if (!runtimeI18n.includes(`${token}:`) || !ui.includes(`rt("${token}")`)) throw new Error(`UI:${token}`); }
if (/split\(\/\\s\+\/\)\[0\]/.test(manager)) throw new Error('COMMAND_PREFIX_ALLOWLIST_REGRESSION');
if (manager.includes('docker run') || manager.includes('podman run')) throw new Error('UNEXPECTED_NATIVE_CONTAINER_BACKEND');
console.log('AIB_PHASE27_CONTAINER_MANAGER_SELFTEST_OK');
