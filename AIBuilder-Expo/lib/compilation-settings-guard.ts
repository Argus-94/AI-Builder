/**
 * Immutable guard for the current AI Builder compilation configuration.
 *
 * This module is intentionally source-tree oriented: it verifies the protected
 * configuration files against the baseline captured in OP-00_04. It does not
 * edit, generate, repair, pin, or replace any compilation setting.
 *
 * If a protected file changes, callers must stop the operation instead of
 * attempting an automatic repair.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";

export const COMPILATION_GUARD_VERSION = "1";
export const BASELINE_SOURCE_VERSION = "1.6.33";

export type CompilationGuardStatus =
  | "ok"
  | "changed"
  | "missing"
  | "unexpected-generated-files";

export type ProtectedFile = {
  path: string;
  sha256: string;
};

/** Files whose contents are part of the immutable compilation baseline. */
export const PROTECTED_FILES: readonly ProtectedFile[] = [
  { path: "app.config.ts", sha256: "538dcf9954b0ba590738a02881363338e1151d10054616c72a3d6f897b8e3ab2" },
  { path: "gradle.properties", sha256: "fd048ca701127912fae07cc1116c79301032c8c25fc6c520f3709de5470b6074" },
  { path: "package.json", sha256: "8b35d09b4df7feb84179f2a6511e4850d97554e00847c216a3c722cda1b8ce07" },
  { path: "pnpm-lock.yaml", sha256: "c94dbcd699698f34f260e3319af8816209341a35686392b48082335713aacf38" },
  { path: "eas.json", sha256: "b89c0cc62bc73ed611f34733a209f2705f78293927b05c4e12fff802e09eeee5" },
  { path: "plugins/withFixGradleProperties.js", sha256: "84da07199a42e0fa9eecfb237b626d6b2bd4b480acf375449451b36b7dbf9790" },
  { path: "plugins/withEnsureBuildConfig.js", sha256: "edc939185df50a634c1be9f42fc94162b2f155de59a72ca8d3cf7d26cad0d055" },
  { path: "plugins/withLlamaRnProguard.js", sha256: "6d36475814f81cf14d1f2c0048dfcc1e64318b9015e532af1fc1ef64cf648357" },
  { path: "plugins/withTermuxBridge.js", sha256: "d876d2e4bcf4e641665bed1cd386b130d9b484e75c0e54773297274416c35295" },
];

/** Generated Android files are absent from the source baseline and must not be silently introduced. */
export const FORBIDDEN_GENERATED_PATHS: readonly string[] = [
  "android/",
  "android/local.properties",
  "android/gradle.properties",
  "android/gradle/wrapper/gradle-wrapper.properties",
  "android/app/build.gradle",
];

export type CompilationGuardResult = {
  status: CompilationGuardStatus;
  ok: boolean;
  sourceVersion: string;
  checked: number;
  failures: string[];
};

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * Verify the immutable compilation baseline. This function is read-only.
 * It never creates directories/files and never changes project configuration.
 */
export function verifyCompilationSettings(projectRoot: string): CompilationGuardResult {
  const root = resolve(projectRoot);
  const failures: string[] = [];

  for (const file of PROTECTED_FILES) {
    const absolute = resolve(root, file.path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      failures.push(`MISSING:${file.path}`);
      continue;
    }
    const actual = sha256File(absolute);
    if (actual !== file.sha256) {
      failures.push(`CHANGED:${file.path}:expected=${file.sha256}:actual=${actual}`);
    }
  }

  for (const relativePath of FORBIDDEN_GENERATED_PATHS) {
    if (existsSync(resolve(root, relativePath))) {
      failures.push(`UNEXPECTED_GENERATED:${relativePath}`);
    }
  }

  const hasGenerated = failures.some((failure) => failure.startsWith("UNEXPECTED_GENERATED:"));
  const hasMissing = failures.some((failure) => failure.startsWith("MISSING:"));
  const status: CompilationGuardStatus = hasGenerated
    ? "unexpected-generated-files"
    : hasMissing
      ? "missing"
      : failures.length
        ? "changed"
        : "ok";

  return {
    status,
    ok: failures.length === 0,
    sourceVersion: BASELINE_SOURCE_VERSION,
    checked: PROTECTED_FILES.length,
    failures,
  };
}
