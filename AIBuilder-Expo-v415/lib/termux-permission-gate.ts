export const RUN_COMMAND_PERMISSION_NAME = "com.termux.permission.RUN_COMMAND";
export const RUN_COMMAND_PERMISSION_SETUP_HINT =
  "Android Settings → Apps → AI Builder → Permissions → Additional permissions → RUN_COMMAND";

/** This exact platform denial proves the package-scoped Android grant is missing. */
export function isAndroidRunCommandPermissionDenied(raw: unknown): boolean {
  return /without permission\s+com\.termux\.permission\.RUN_COMMAND|permission denial[^\n]*com\.termux\.permission\.RUN_COMMAND|RUN_COMMAND_PERMISSION_MISSING/i.test(String(raw ?? ""));
}

export function runCommandPermissionStatus(raw?: unknown): string {
  const detail = String(raw ?? "");
  return isAndroidRunCommandPermissionDenied(detail)
    ? `RUN_COMMAND_PERMISSION_MISSING: grant ${RUN_COMMAND_PERMISSION_NAME} in ${RUN_COMMAND_PERMISSION_SETUP_HINT}. No Termux command was dispatched.`
    : `RUN_COMMAND_PERMISSION_CHECK_FAILED: could not verify ${RUN_COMMAND_PERMISSION_NAME}. No Termux command was dispatched.`;
}

/** Small single-flight cache: denied checks are throttled longer to stop callback floods. */
export class RunCommandPermissionGate {
  private cached: { value: boolean; checkedAt: number } | null = null;
  private pending: Promise<boolean> | null = null;
  private readonly allowedTtlMs: number;
  private readonly deniedTtlMs: number;

  constructor(allowedTtlMs = 5_000, deniedTtlMs = 30_000) {
    this.allowedTtlMs = allowedTtlMs;
    this.deniedTtlMs = deniedTtlMs;
  }

  remember(value: boolean): void {
    this.cached = { value, checkedAt: Date.now() };
  }

  invalidate(): void {
    this.cached = null;
  }

  async check(readPermission: () => Promise<boolean>, forceRefresh = false): Promise<boolean> {
    if (forceRefresh) this.invalidate();
    const now = Date.now();
    if (this.cached) {
      const ttl = this.cached.value ? this.allowedTtlMs : this.deniedTtlMs;
      if (now - this.cached.checkedAt < ttl) return this.cached.value;
    }
    if (this.pending) return this.pending;
    const pending = Promise.resolve().then(readPermission).then((value) => {
      this.remember(value === true);
      return value === true;
    }, (error: unknown) => {
      this.remember(false);
      throw error;
    });
    this.pending = pending;
    try {
      return await pending;
    } finally {
      if (this.pending === pending) this.pending = null;
    }
  }
}
