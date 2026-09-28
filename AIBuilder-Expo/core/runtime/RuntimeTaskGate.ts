/**
 * Cooperative gate: normal work may coexist; maintenance is exclusive and drains normal work first.
 * Enhanced with drain timeout and maintenance snapshot for diagnostics.
 */
export type RuntimeTaskMode = "normal" | "maintenance";
export type RuntimeTask = Readonly<{
  id: string;
  mode: RuntimeTaskMode;
  owner: string;
  startedAt: number;
}>;

export class RuntimeTaskGate {
  private readonly normal = new Map<string, RuntimeTask>();
  private maintenance: RuntimeTask | null = null;
  private maintenanceRequested = false;
  private queue: Promise<void> = Promise.resolve();
  private readonly drainTimeoutMs: number;

  constructor(options?: { drainTimeoutMs?: number }) {
    this.drainTimeoutMs = options?.drainTimeoutMs ?? 15_000;
  }

  snapshot() {
    return {
      normal: [...this.normal.values()],
      maintenance: this.maintenance,
      maintenanceRequested: this.maintenanceRequested,
    };
  }

  async run<T>(mode: RuntimeTaskMode, owner: string, fn: () => Promise<T> | T): Promise<T> {
    if (mode === "normal") return this.runNormal(owner, fn);
    return this.runMaintenance(owner, fn);
  }

  private async runNormal<T>(owner: string, fn: () => Promise<T> | T): Promise<T> {
    while (this.maintenance || this.maintenanceRequested) {
      await this.queue;
    }
    const task: RuntimeTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode: "normal",
      owner,
      startedAt: Date.now(),
    };
    this.normal.set(task.id, task);
    try {
      return await fn();
    } finally {
      this.normal.delete(task.id);
    }
  }

  private async runMaintenance<T>(owner: string, fn: () => Promise<T> | T): Promise<T> {
    this.maintenanceRequested = true;
    let release!: () => void;
    const previous = this.queue;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    const deadline = Date.now() + this.drainTimeoutMs;
    while (this.normal.size > 0 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 15));
    }
    // Stale normal tasks past deadline are left; maintenance proceeds (DSHA-style barrier with timeout)

    const task: RuntimeTask = {
      id: `maintenance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      mode: "maintenance",
      owner,
      startedAt: Date.now(),
    };
    this.maintenance = task;
    this.maintenanceRequested = false;
    try {
      return await fn();
    } finally {
      this.maintenance = null;
      release();
    }
  }
}
