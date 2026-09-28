import type { ProcessRegistry, RegisteredProcess } from "../process/ProcessRegistry";
import {
  DEFAULT_SUPERVISOR_POLICY,
  RestartBudget,
  computeBackoffMs,
  type SupervisorPolicy,
} from "./SupervisorPolicy";

export type SupervisorStatus = "stopped" | "running" | "degraded" | "quarantined";

export type SupervisorSnapshot = Readonly<{
  status: SupervisorStatus;
  watched: number;
  lastTick: number | null;
  failures: number;
  quarantined: number;
  policy: SupervisorPolicy;
}>;

export class RuntimeSupervisor {
  private timer: ReturnType<typeof setInterval> | null = null;
  private status: SupervisorStatus = "stopped";
  private lastTick: number | null = null;
  private failures = 0;
  private readonly quarantined = new Set<string>();
  private readonly budget: RestartBudget;
  private readonly policy: SupervisorPolicy;

  constructor(
    private readonly registry: ProcessRegistry,
    private readonly onFailure?: (
      process: RegisteredProcess,
      error: unknown,
    ) => Promise<void> | void,
    policy: SupervisorPolicy = DEFAULT_SUPERVISOR_POLICY,
  ) {
    this.policy = policy;
    this.budget = new RestartBudget(policy);
  }

  start(intervalMs?: number) {
    if (this.timer) return;
    this.status = "running";
    const ms = Math.max(1000, intervalMs ?? this.policy.defaultTickIntervalMs);
    this.timer = setInterval(() => void this.tick(), ms);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.status = "stopped";
  }

  async tick() {
    this.lastTick = Date.now();
    try {
      for (const p of this.registry.list()) {
        if (p.metadata?.[this.policy.watchdogMetadataKey] !== this.policy.watchdogEnabledValue) {
          continue;
        }
        if (p.metadata?.health !== "failed") continue;
        if (this.quarantined.has(p.id)) continue;

        if (!this.budget.tryConsume(p.id)) {
          this.quarantined.add(p.id);
          this.status = "quarantined";
          continue;
        }

        const attempt = this.budget.count(p.id);
        const delay = computeBackoffMs(attempt, this.policy);
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, Math.min(delay, 5_000)));
        }
        try {
          await this.onFailure?.(p, new Error("WATCHDOG_HEALTH_FAILED"));
        } catch {
          this.failures++;
          this.status = "degraded";
        }
      }
    } catch {
      this.failures++;
      this.status = "degraded";
    }
  }

  clearQuarantine(processId?: string): void {
    if (processId) {
      this.quarantined.delete(processId);
      this.budget.reset(processId);
    } else {
      this.quarantined.clear();
      this.budget.reset();
    }
    if (this.timer && this.status !== "running") this.status = "running";
  }

  snapshot(): SupervisorSnapshot {
    return {
      status: this.status,
      watched: this.registry
        .list()
        .filter(
          (p) =>
            p.metadata?.[this.policy.watchdogMetadataKey] ===
            this.policy.watchdogEnabledValue,
        ).length,
      lastTick: this.lastTick,
      failures: this.failures,
      quarantined: this.quarantined.size,
      policy: this.policy,
    };
  }
}
