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

export const COMPILATION_GUARD_VERSION = "3";
export const BASELINE_SOURCE_VERSION = "1.10.18";
export const BASELINE_ANDROID_APPLICATION_ID = "com.karat.aibuilder";
export const BASELINE_IOS_BUNDLE_IDENTIFIER = "com.karat.aibuilder";

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
  { path: "app.config.ts", sha256: "21877ea4fc30325711ecce2a95c30978e1d9c277ceb985d50d4d30b7317dce89" },
  { path: "AI_BUILDER_ANDROID_IDENTITY.json", sha256: "35e62198b3b18f06d471c7ef0827cc06a43778b6316720784dc7076a9a58e1b3" },
  { path: "gradle.properties", sha256: "fd048ca701127912fae07cc1116c79301032c8c25fc6c520f3709de5470b6074" },
  { path: "package.json", sha256: "d057c81ee2888b84b08264cd04c31b0432590b8f5021dd43006668ee239dbfec" },
  { path: "pnpm-lock.yaml", sha256: "fe6513fae51ceaaf0126792bdfe9901711d60d0f4439389b7eaef500b3d78efc" },
  { path: "eas.json", sha256: "b89c0cc62bc73ed611f34733a209f2705f78293927b05c4e12fff802e09eeee5" },
  { path: "plugins/withFixGradleProperties.js", sha256: "84da07199a42e0fa9eecfb237b626d6b2bd4b480acf375449451b36b7dbf9790" },
  { path: "plugins/withEnsureBuildConfig.js", sha256: "c042dd812b78491c509dcbb07d34550a72d6959b61f800a0145e827718550ef8" },
  { path: "plugins/withLlamaRnProguard.js", sha256: "6d36475814f81cf14d1f2c0048dfcc1e64318b9015e532af1fc1ef64cf648357" },
  { path: "plugins/withTermuxBridge.js", sha256: "07c0005f927548f1ca82c95d008e3f17ae4bc503f2aca0d3bf763fbd692fc45f" },
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
