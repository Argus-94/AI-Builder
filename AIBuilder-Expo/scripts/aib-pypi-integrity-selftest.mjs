import fs from 'node:fs';

const src = fs.readFileSync('lib/termux-packs.ts', 'utf8');
const reverseStart = src.indexOf('export const REVERSE_PACK');
const allStart = src.indexOf('export const ALL_TOOL_PACKS');
const reverse = reverseStart >= 0 && allStart > reverseStart ? src.slice(reverseStart, allStart) : src;
const installSection = reverse.includes('installSteps:')
  ? reverse.slice(reverse.indexOf('installSteps:'), reverse.indexOf('removeSteps:') > 0 ? reverse.indexOf('removeSteps:') : reverse.length)
  : reverse;

if (/kind:\s*"pip"\s*,\s*primary:/i.test(installSection)) throw new Error('AIB_PYPI_UNPINNED_INSTALL_PRESENT');
if (/python -m pip install/i.test(installSection)) throw new Error('AIB_PYPI_DIRECT_INSTALL_PRESENT');
if (/pip install --upgrade/i.test(src)) throw new Error('AIB_PYPI_BUILD_COMMAND_PRESENT');
if (/r2pm\s+-[Ui]/i.test(installSection)) throw new Error('AIB_R2PM_UNPINNED_INSTALL_PRESENT');
// Fail-closed: either explicit PIP_DISABLED_STEP in install steps, or packs emptied with policy constant present
if (!/PIP_DISABLED_STEP/.test(src)) throw new Error('AIB_PYPI_FAIL_CLOSED_MISSING');
if (!/package resolution is not integrity-pinned/i.test(src)) throw new Error('AIB_PYPI_POLICY_TEXT_MISSING');
console.log('AIB_PYPI_INTEGRITY_SELFTEST_OK pip_install=blocked r2pm=blocked');
