/**
 * Self-test: RuntimeFacade contracts (no device / no Gradle).
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const root = process.cwd();
const require = createRequire(import.meta.url);

const errors = [];

function ok(cond, msg) {
  if (!cond) errors.push(msg);
}

// Source presence
const required = [
  "core/RuntimeFacade.ts",
  "core/RuntimeStatus.ts",
  "core/project-runtime.ts",
  "core/ubuntu/UbuntuLifecycle.ts",
  "core/container/KaliLifecycle.ts",
  "lib/runtime-facade.ts",
  "hooks/useRuntime.ts",
  "core/environment/TermuxTerminalBackend.ts",
  "core/container/ContainerShell.ts",
  "core/container/ProotCommandBuilder.ts",
  "core/container/RootfsDiscovery.ts",
  "core/index.ts",
];
for (const rel of required) {
  ok(fs.existsSync(path.join(root, rel)), `MISSING:${rel}`);
}

// package version
const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
ok(typeof pkg.version === "string" && /^1\.\d+\.\d+/.test(pkg.version), `VERSION:${pkg.version}`);

// Guard still lists package.json
const guard = fs.readFileSync(path.join(root, "lib/compilation-settings-guard.ts"), "utf8");
ok(guard.includes("package.json"), "GUARD_PACKAGE_JSON_MISSING");
ok(guard.includes("PROTECTED_FILES"), "GUARD_PROTECTED_MISSING");

// Facade exports surface
const facadeSrc = fs.readFileSync(path.join(root, "core/RuntimeFacade.ts"), "utf8");
for (const token of [
  "openProjectSession",
  "launchUbuntu",
  "registerDefaultToolchainSources",
  "finalValidation",
  "diagnostics",
  "openTerminalForProject",
  "createAgentForProject",
  "launchKali",
  "buildProotPlanForInstance",
  "runProotPlanForInstance",
  "runProotAuto",
  "refreshToolchains",
  "discoverContainerRootfs",
]) {
  ok(facadeSrc.includes(token), `FACADE_MISSING:${token}`);
}

const indexSrc = fs.readFileSync(path.join(root, "core/index.ts"), "utf8");
ok(indexSrc.includes("createRuntimeFacade"), "INDEX_FACADE");
ok(indexSrc.includes("snapshotRuntimeStatus"), "INDEX_STATUS");

if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(`AIB_RUNTIME_FACADE_SELFTEST_OK version=${pkg.version}`);
