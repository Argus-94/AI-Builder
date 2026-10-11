#!/usr/bin/env node
// Run with: node --experimental-strip-types scripts/aib-termux-apt-install-regression-selftest.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { wrapTermuxAptInstallWithUpdate } from "../lib/termux-apt-install.ts";
import { formatPackageInstallFailure } from "../lib/package-install-diagnostics.ts";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const diagnostic = "E: APT mock hidden stderr: configured source returned HTTP 404 while fetching Packages";
const sourceText = "# fixture: user-selected Termux source\ndeb https://example.invalid/termux-main stable main\n";

function runInstallCase({ updateMode = "success", installMode = "success" } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aib-termux-apt-regression-"));
  const prefix = path.join(dir, "prefix");
  const bin = path.join(dir, "bin");
  const lists = path.join(prefix, "var", "lib", "apt", "lists");
  const sources = path.join(prefix, "etc", "apt", "sources.list");
  const aptLog = path.join(dir, "apt-calls.log");
  fs.mkdirSync(path.dirname(sources), { recursive: true });
  fs.mkdirSync(bin, { recursive: true });
  fs.writeFileSync(sources, sourceText);
  fs.writeFileSync(path.join(bin, "apt-get"), `#!/bin/sh
set -u
printf '%s\\n' "$*" >> "$APT_LOG"
if [ "\${1:-}" = update ]; then
  case "$MOCK_UPDATE_MODE" in
    fail100)
      echo 'Hit:1 https://example.invalid/termux-main stable InRelease'
      echo '${diagnostic}' >&2
      exit 100
      ;;
    fail37)
      echo 'Hit:1 https://example.invalid/termux-main stable InRelease'
      echo 'E: mock apt status must remain 37' >&2
      exit 37
      ;;
    no-index)
      echo 'Hit:1 https://example.invalid/termux-main stable InRelease'
      exit 0
      ;;
    success)
      mkdir -p "$PREFIX/var/lib/apt/lists"
      printf 'Package: fixture\\nVersion: 1\\n' > "$PREFIX/var/lib/apt/lists/mock_dists_stable_main_binary-aarch64_Packages.lz4"
      echo 'Hit:1 https://example.invalid/termux-main stable InRelease'
      exit 0
      ;;
  esac
fi
case " $* " in
  *' -f install '*) echo 'Mock dependency repair: ok'; exit 0 ;;
esac
if [ "\${1:-}" = install ]; then
  if [ "$MOCK_INSTALL_MODE" = fail42 ]; then
    echo 'E: mock package installation failure: fixture package is unavailable' >&2
    exit 42
  fi
  echo 'Mock package installation succeeded'
  exit 0
fi
exit 0
`, { mode: 0o755 });
  fs.writeFileSync(path.join(bin, "dpkg"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const env = {
    ...process.env,
    PREFIX: prefix,
    PATH: `${bin}:${process.env.PATH || ""}`,
    APT_LOG: aptLog,
    MOCK_UPDATE_MODE: updateMode,
    MOCK_INSTALL_MODE: installMode,
  };
  const result = spawnSync("bash", ["-c", wrapTermuxAptInstallWithUpdate("apt-get install -y fixture-package")], {
    encoding: "utf8",
    env,
  });
  assert.equal(result.error, undefined, result.error?.message);
  const calls = fs.existsSync(aptLog) ? fs.readFileSync(aptLog, "utf8") : "";
  const unchangedSource = fs.readFileSync(sources, "utf8");
  const output = `${result.stdout || ""}\n${result.stderr || ""}`;
  return {
    dir,
    result,
    calls,
    unchangedSource,
    output,
    indexes: fs.existsSync(lists)
      ? fs.readdirSync(lists).filter((entry) => entry.includes("Packages"))
      : [],
  };
}

let testCount = 0;
try {
  // Exact reported shape: apt's visible stdout contains only Hit; its useful
  // error is written to stderr and must survive log capture, bridge result, and UI formatting.
  const updateFail = runInstallCase({ updateMode: "fail100" });
  try {
    assert.equal(updateFail.result.status, 100, updateFail.output);
    assert.match(updateFail.output, /Hit:1 https:\/\/example\.invalid\/termux-main stable InRelease/);
    assert.match(updateFail.calls, /^update /m);
    assert.doesNotMatch(updateFail.calls, /install -y fixture-package/);
    const ui = formatPackageInstallFailure({
      exitCode: updateFail.result.status,
      stdout: updateFail.result.stdout,
      stderr: updateFail.result.stderr,
    });
    assert.match(ui, /exit 100: apt-get update failed/);
    assert.ok(ui.includes(diagnostic), `apt stderr did not reach the install UI: ${ui}`);
    assert.equal(updateFail.unchangedSource, sourceText, "configured Termux source changed during failed update");
    testCount++;
  } finally { fs.rmSync(updateFail.dir, { recursive: true, force: true }); }

  // A nonstandard apt exit is not rewritten to 100, and the install command is gated.
  const statusFail = runInstallCase({ updateMode: "fail37" });
  try {
    assert.equal(statusFail.result.status, 37, statusFail.output);
    assert.match(statusFail.output, /mock apt status must remain 37/);
    assert.doesNotMatch(statusFail.calls, /install -y fixture-package/);
    assert.equal(statusFail.unchangedSource, sourceText);
    testCount++;
  } finally { fs.rmSync(statusFail.dir, { recursive: true, force: true }); }

  // apt exit 0 without a non-empty Packages index is a validation failure, not success.
  const noIndex = runInstallCase({ updateMode: "no-index" });
  try {
    assert.equal(noIndex.result.status, 100, noIndex.output);
    assert.match(noIndex.output, /produced no non-empty Termux Packages indexes/);
    assert.doesNotMatch(noIndex.calls, /install -y fixture-package/);
    assert.equal(noIndex.unchangedSource, sourceText);
    testCount++;
  } finally { fs.rmSync(noIndex.dir, { recursive: true, force: true }); }

  // A successful update creates an index, but a later install error retains its
  // actual code and full apt diagnostic all the way to the shared UI formatter.
  const installFail = runInstallCase({ updateMode: "success", installMode: "fail42" });
  try {
    assert.equal(installFail.result.status, 42, installFail.output);
    assert.ok(installFail.indexes.some((entry) => entry.endsWith("Packages.lz4")));
    assert.match(installFail.calls, /^update /m);
    assert.match(installFail.calls, /^install -y fixture-package$/m);
    const ui = formatPackageInstallFailure({
      exitCode: installFail.result.status,
      stdout: installFail.result.stdout,
      stderr: installFail.result.stderr,
    });
    assert.match(ui, /exit 42: apt-get install failed/);
    assert.match(ui, /mock package installation failure: fixture package is unavailable/);
    assert.equal(installFail.unchangedSource, sourceText);
    testCount++;
  } finally { fs.rmSync(installFail.dir, { recursive: true, force: true }); }

  // Successful update plus index plus successful install remains successful.
  const success = runInstallCase({ updateMode: "success", installMode: "success" });
  try {
    assert.equal(success.result.status, 0, success.output);
    assert.ok(success.indexes.some((entry) => entry.endsWith("Packages.lz4")));
    assert.match(success.calls, /^install -y fixture-package$/m);
    assert.equal(success.unchangedSource, sourceText);
    testCount++;
  } finally { fs.rmSync(success.dir, { recursive: true, force: true }); }

  const compile = fs.readFileSync(path.join(root, "lib/compile-packages.ts"), "utf8");
  const reverse = fs.readFileSync(path.join(root, "lib/reverse-packages.ts"), "utf8");
  const custom = fs.readFileSync(path.join(root, "lib/custom-packages.ts"), "utf8");
  const envSource = fs.readFileSync(path.join(root, "lib/termux-installer-env.ts"), "utf8");
  const dispatcher = fs.readFileSync(path.join(root, "lib/package-backend.ts"), "utf8");
  for (const [name, source] of [["compile", compile], ["reverse", reverse], ["custom", custom]]) {
    assert.match(source, /formatPackageInstallFailure\(/, `${name} does not use the shared UI error formatter`);
    assert.match(source, /runPackageCommand\(def\.installCmd/, `${name} does not route raw install commands through the package dispatcher`);
    assert.doesNotMatch(source, /runPackageCommand\(withInstallerEnvironment\(/, `${name} pre-wraps an install command`);
  }
  assert.doesNotMatch(reverse + custom, /withPackageIndexUpdate\(\)[\s\S]{0,500}soft-fail/);
  assert.match(envSource, /wrapTermuxAptInstallWithUpdate\(preferAptGetInstall\(installCmd\)\)/);
  assert.match(dispatcher, /withInstallerEnvironment\(adapted, targetBackend\)/);
  assert.match(compile, /id: "which"[\s\S]*?installCmd:[\s\S]*?apt-get install -y debianutils/);
  assert.doesNotMatch(compile, /termux-change-repo/);
  testCount++;
} finally {
  // Individual case directories are removed alongside assertions above.
}

console.log(`AIB_TERMUX_APT_INSTALL_REGRESSION_OK cases=${testCount} apt_update_gate=1 exact_exit=1 stderr_to_ui=1 indexes=1 source_preserved=1`);
