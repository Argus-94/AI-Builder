/**
 * Runtime-only project subsystem regression harness.
 * It composes injected contracts and does not touch build configuration.
 */
export type RegressionCheck = {
  name: string;
  run: () => Promise<void> | void;
};

export type RegressionReport = {
  passed: string[];
  failed: Array<{ name: string; error: string }>;
};

export async function runProjectRegression(
  checks: RegressionCheck[],
): Promise<RegressionReport> {
  const passed: string[] = [];
  const failed: Array<{ name: string; error: string }> = [];

  for (const check of checks) {
    try {
      await check.run();
      passed.push(check.name);
    } catch (error) {
      failed.push({
        name: check.name,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { passed, failed };
}

export function assertRegressionClean(report: RegressionReport): void {
  if (report.failed.length > 0) {
    const details = report.failed
      .map((item) => `${item.name}: ${item.error}`)
      .join("; ");
    throw new Error(`Project regression failed: ${details}`);
  }
}
