import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const errors = [];
const pkg = JSON.parse(read('package.json'));
const app = read('app.config.ts');
const guide = read('lib/settings-guide.ts');
const about = read('lib/about-content.ts');
const termux = read('app/termux-settings.tsx');
const i18n = read('lib/i18n.ts');
const readme = read('README.md');
const plan = read('AIBuilder_TEST_PLAN.md');
const commands = read('lib/termux-commands.ts');

if (!app.includes('version: APP_VERSION')) errors.push('APP_VERSION_SOURCE_MISSING');
for (const token of ['OpenRouter', 'DeepSeek', 'OpenCode', 'Custom provider', 'Agent intelligence', 'Shizuku', 'Termux:Boot', 'Update Termux environment', 'Checkpoints']) {
  if (!guide.includes(token) && !about.includes(token) && !readme.includes(token)) errors.push(`DOC_TOPIC_MISSING:${token}`);
}
for (const token of ['Shizuku', 'Termux:Boot', 'Termux On', 'Termux Off', 'termuxCopyAndOpen', 'downloadAddon', 'launchApkInstall']) {
  if (!termux.includes(token) && !i18n.includes(token)) errors.push(`TERMUX_TOPIC_MISSING:${token}`);
}
if (termux.includes('termuxFirstLaunch') || termux.includes('Первый запуск Termux')) errors.push('FIRST_LAUNCH_CARD_STILL_PRESENT');
for (const token of ['app', 'termux', 'native', 'console', 'network', 'agent']) {
  if (!plan.includes('`' + token + '`') && !readme.includes('`' + token + '`')) errors.push(`LOG_SOURCE_DOC_MISSING:${token}`);
}
for (const lang of ['uk:', 'ru:', 'en:']) if (!guide.includes(lang)) errors.push(`GUIDE_LANGUAGE_MISSING:${lang}`);
if (!fs.existsSync(path.join(root, 'CHANGELOG_V211.md'))) errors.push('CHANGELOG_V211_MISSING');
if (!fs.existsSync(path.join(root, 'CHANGELOG.md'))) errors.push('CHANGELOG_MD_MISSING');
if (!fs.existsSync(path.join(root, 'DEVICE_SMOKE.md'))) errors.push('DEVICE_SMOKE_MISSING');
if (!fs.existsSync(path.join(root, 'CHANGELOG_ARCHIVE_INDEX.md'))) errors.push('CHANGELOG_ARCHIVE_MISSING');

if (!commands.includes('yes | pkg update -y && yes | pkg upgrade -y')) errors.push('TERMUX_UPDATE_COMMAND_DOC_MISSING');
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`AIB_DOCS_SELFTEST_OK version=${pkg.version}`);
