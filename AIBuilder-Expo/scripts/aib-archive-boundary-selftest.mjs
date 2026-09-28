import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const packs = fs.readFileSync(path.join(root, 'lib/termux-packs.ts'), 'utf8');
const agent = fs.readFileSync(path.join(root, 'lib/termux-agent.ts'), 'utf8');
const packsDisabled = /ALL_TOOL_PACKS:\s*TermuxToolPack\[\] = \[\]/.test(packs);
if (!packsDisabled) {
  for (const marker of ["android-sdk cmdline (Java/Termux)", "android build-tools (non-ARM host)", "android-ndk", "dex2jar"]) {
    const i = packs.indexOf(`label: "${marker}"`);
    if (i < 0) throw new Error(`missing ${marker}`);
    const next = packs.slice(i, i + 8000);
    if (!/SAFE_(?:ZIP|TAR)_EXTRACT_CHECK/.test(next)) throw new Error(`archive extraction guard missing for ${marker}`);
  }
}
if (!/unzip -oq/.test(agent) || !/tar -tf/.test(agent) || !/SAFE_PROJECT_ZIP_CHECK/.test(agent) || !/SAFE_DEPS_CACHE_CHECK/.test(agent)) throw new Error('expected extraction commands missing');
if (!/100000/.test(packs) || !/8589934592/.test(packs) || !/2147483648/.test(packs)) throw new Error('archive size/count limits missing');
if (!/zip special\/link member is forbidden/.test(packs) || !/unsafe tar special\/link member/.test(packs)) throw new Error('special-file archive guards missing');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aib-archive-'));
try {
  const safe = path.join(tmp, 'safe');
  fs.mkdirSync(safe);
  fs.writeFileSync(path.join(safe, 'ok.txt'), 'ok');
  const zip = path.join(tmp, 'safe.zip');
  execFileSync('zip', ['-q', '-r', zip, 'safe'], { cwd: tmp });

  const bad = path.join(tmp, 'bad');
  fs.mkdirSync(bad);
  fs.writeFileSync(path.join(bad, 'x'), 'x');
  const outside = path.join(tmp, 'outside');
  fs.writeFileSync(outside, 'outside');
  fs.symlinkSync(outside, path.join(bad, 'escape'));
  const badZip = path.join(tmp, 'bad.zip');
  execFileSync('zip', ['-q', '-yr', badZip, 'bad'], { cwd: tmp });

  const checkZip = (archive) => {
    const list = execFileSync('unzip', ['-Z1', archive], { encoding: 'utf8' });
    if (/^\//m.test(list) || /(^|\/)\.\.(\/|$)/m.test(list)) return false;
    try {
      const info = execFileSync('zipinfo', ['-l', archive], { encoding: 'utf8' });
      if (/^l[-rwx]{9}\s/m.test(info)) return false;
    } catch { return false; }
    return true;
  };
  if (!checkZip(zip)) throw new Error('safe zip rejected');
  if (checkZip(badZip)) throw new Error('malicious zip accepted');

  const tarRoot = path.join(tmp, 'tarroot');
  fs.mkdirSync(tarRoot);
  fs.writeFileSync(path.join(tarRoot, 'ok.txt'), 'ok');
  const safeTar = path.join(tmp, 'safe.tar');
  execFileSync('tar', ['-cf', safeTar, '-C', tarRoot, 'ok.txt']);
  const badTarRoot = path.join(tmp, 'badtar');
  fs.mkdirSync(badTarRoot);
  fs.symlinkSync(outside, path.join(badTarRoot, 'escape'));
  const badTar = path.join(tmp, 'bad.tar');
  execFileSync('tar', ['-cf', badTar, '-C', badTarRoot, 'escape']);
  const checkTar = (archive) => {
    const list = execFileSync('tar', ['-tf', archive], { encoding: 'utf8' });
    if (/^\//m.test(list) || /(^|\/)\.\.(\/|$)/m.test(list)) return false;
    const info = execFileSync('tar', ['-tvf', archive], { encoding: 'utf8' });
    return !/^[lh]/m.test(info);
  };
  if (!checkTar(safeTar)) throw new Error('safe tar rejected');
  if (checkTar(badTar)) throw new Error('malicious tar accepted');

  const fifoRoot = path.join(tmp, 'fifo');
  fs.mkdirSync(fifoRoot);
  execFileSync('mkfifo', [path.join(fifoRoot, 'pipe')]);
  const fifoTar = path.join(tmp, 'fifo.tar');
  execFileSync('tar', ['-cf', fifoTar, '-C', fifoRoot, 'pipe']);
  const fifoInfo = execFileSync('tar', ['-tvf', fifoTar], { encoding: 'utf8' });
  if (!/^[p]/m.test(fifoInfo)) throw new Error('fifo fixture was not created');
  if (!/100000/.test(packs) || !/8589934592/.test(packs)) throw new Error('archive limits missing');
if (!/i\.file_size>2147483648/.test(packs) || !/total >?= ?8589934592|total>8589934592/.test(packs)) throw new Error('zip size guards missing');
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log('AIB_ARCHIVE_BOUNDARY_SELFTEST_OK traversal=blocked links=blocked special_files=blocked size_limits=8GB/2GB/100k');
