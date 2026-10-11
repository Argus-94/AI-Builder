import fs from 'node:fs';
import vm from 'node:vm';
import Module from 'node:module';
import { spawnSync } from 'node:child_process';

const pluginPath = new URL('../plugins/withTermuxBridge.js', import.meta.url).pathname;
const source = fs.readFileSync(pluginPath, 'utf8');
if (source.includes('private fun nativeLog(cmdId: String, level: String, message: String)')) {
  throw new Error('raw-message nativeLog signature remains');
}
if (!source.includes('nativeLog(id, "info", "dispatch", timeoutMs = timeoutMs.toLong(), clientCommandId = requestId)')) {
  throw new Error('safe dispatch marker is missing');
}

const temp = `${pluginPath}.selftest.cjs`;
fs.writeFileSync(temp, `${source}\nmodule.exports={moduleKotlin, withTermuxBridgeMainApplication};\n`, 'utf8');
const originalLoad = Module._load;
const modCallbacks = {};
try {
  Module._load = function(request, parent, isMain) {
    if (request === '@expo/config-plugins') {
      return {
        withAndroidManifest(config) { return config; },
        withMainApplication(config, action) { modCallbacks.mainApplication = action; return config; },
        withDangerousMod(config) { return config; },
      };
    }
    return originalLoad.apply(this, arguments);
  };
  const { moduleKotlin, withTermuxBridgeMainApplication } = await import(`file://${temp}?t=${Date.now()}`);
  const generated = moduleKotlin('com.karat.aibuilder');
  const lines = generated.split('\n');
  const eofSafeLoops = source.match(/while IFS= read -r line \|\| \[ -n /g) || [];
  if (eofSafeLoops.length < 2) {
    throw new Error('stdout/stderr forwarders must preserve an unterminated final line');
  }
  const eofRun = spawnSync('bash', ['-c', 'printf abc | while IFS= read -r line || [ -n "$line" ]; do printf \'%s\\n\' "$line"; done'], { encoding: 'utf8' });
  if (eofRun.status !== 0 || eofRun.stdout !== 'abc\n') {
    throw new Error(`EOF line was lost by the forwarding loop: ${eofRun.stdout}`);
  }
  const generatedForwarders = lines.filter((line) => line.includes('while IFS= read -r line || [ -n '));
  const escapedShellLineGuard = String.raw`[ -n \"\$line\" ]`;
  if (generatedForwarders.length !== 2 || generatedForwarders.some((line) => !line.includes(escapedShellLineGuard))) {
    throw new Error('stdout/stderr Kotlin templates must keep quoted shell $line guards escaped in Kotlin');
  }
  if (!generated.includes('private fun nativeLogTag(): String = "AIB-TermuxBridge"') || !generated.includes('val text = fields.joinToString(" ")')) {
    throw new Error('generated structured Logcat logger is invalid');
  }
  if (!generated.includes('shellQuote(command)')) {
    throw new Error('Termux command payload is no longer forwarded to the execution bridge');
  }
  if (!generated.includes('(?:js|tr)-[A-Za-z0-9_-]{1,96}')) {
    throw new Error('native callback/lifecycle correlation must accept both JS and trace command ID formats');
  }
  if (generated.includes('command=') || generated.includes('message.replace(')) {
    throw new Error('generated Logcat template contains raw command/message logging');
  }
  let inString = false;
  let escaped = false;
  for (let i = 0; i < lines.length; i++) {
    for (const ch of lines[i]) {
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
      } else if (ch === '"') {
        inString = true;
      }
    }
    if (inString && i + 1 < lines.length) {
      throw new Error(`unterminated Kotlin string at generated line ${i + 1}`);
    }
  }
  withTermuxBridgeMainApplication({});
  const appFixtures = [
    { name: 'kt-post-github-apply', language: 'kt', contents: 'override fun getPackages(): List<ReactPackage> =\n  PackageList(this).packages.toMutableList().apply {\n    add(GithubToolPackage())\n  }' },
    { name: 'kt-original-apply', language: 'kt', contents: 'override fun getPackages(): List<ReactPackage> = PackageList(this).packages.apply { }' },
    { name: 'kt-mutable-list', language: 'kt', contents: 'val packages = PackageList(this).packages.toMutableList()\nreturn packages' },
    { name: 'kt-immutable-list', language: 'kt', contents: 'val packages = PackageList(this).packages\nreturn packages' },
    { name: 'kt-direct-return', language: 'kt', contents: 'return PackageList(this).packages' },
    { name: 'kt-comment-only', language: 'kt', contents: '// add(TermuxBridgePackage())\nreturn PackageList(this).packages' },
    { name: 'java-assignment', language: 'java', contents: 'List<ReactPackage> packages = new PackageList(this).getPackages();\nreturn packages;' },
    { name: 'java-direct-return', language: 'java', contents: 'return new PackageList(this).getPackages();' },
  ];
  for (const fixture of appFixtures) {
    const modConfig = { modResults: { language: fixture.language, contents: fixture.contents } };
    modCallbacks.mainApplication(modConfig);
    const output = modConfig.modResults.contents;
    const uncommented = output.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ').replace(/(\s)\/\/.*$/gm, '$1');
    if ((uncommented.match(/\badd\s*\(\s*(?:new\s+)?TermuxBridgePackage\s*\(\s*\)\s*\)/g) || []).length !== 1) {
      throw new Error(`${fixture.name} must register TermuxBridgePackage exactly once`);
    }
    if (fixture.name === 'kt-post-github-apply' && !output.includes('add(GithubToolPackage())')) {
      throw new Error('Termux registration must preserve a previously registered GithubToolPackage');
    }
    const repeated = { modResults: { language: fixture.language, contents: output } };
    modCallbacks.mainApplication(repeated);
    if (repeated.modResults.contents !== output) throw new Error(`${fixture.name} registration must be idempotent`);
  }
  const unsupported = { modResults: { language: 'kt', contents: 'class MainApplication {}' } };
  let failClosed = false;
  try { modCallbacks.mainApplication(unsupported); } catch (e) { failClosed = String(e?.message || e).includes('TermuxBridgePackage'); }
  if (!failClosed) throw new Error('unknown MainApplication shape must fail closed');
  console.log(`AIB_TERMUX_BRIDGE_KOTLIN_TEMPLATE_SELFTEST_OK generated_strings=valid logcat=structured_only main_application_fixtures=${appFixtures.length} idempotent=1 fail_closed=1`);
} finally {
  Module._load = originalLoad;
  fs.rmSync(temp, { force: true });
}
