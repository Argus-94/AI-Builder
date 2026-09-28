/**
 * ProotDistroBackend — Termux proot-distro (Debian/Ubuntu userspace).
 * Open-source, GPL proot under the hood — no proprietary proroot.
 */
import type {
  BackendExecRequest,
  BackendExecResult,
  BackendProbeResult,
  RuntimeBackend,
} from "../RuntimeBackend";

export type ProotProfile = "debian" | "ubuntu";

export class ProotDistroBackend implements RuntimeBackend {
  readonly id = "proot-distro" as const;
  readonly priority = 20;
  readonly capabilities = ["shell", "rootfs", "apt", "glibc", "isolated-workspace"] as const;

  constructor(
    private readonly execFn: (command: string, opts?: { cwd?: string; timeoutMs?: number }) => Promise<{
      exitCode?: number;
      code?: number;
      stdout?: string;
      stderr?: string;
    }>,
    private readonly profile: ProotProfile = "debian",
  ) {}

  async probe(): Promise<BackendProbeResult> {
    const started = Date.now();
    try {
      const has = await this.execFn("command -v proot-distro >/dev/null 2>&1; echo $?", { timeoutMs: 5000 });
      const hasCode = (has.stdout ?? "").trim();
      if (hasCode !== "0") {
        return {
          id: this.id,
          health: "unavailable",
          latencyMs: Date.now() - started,
          detail: "proot-distro not installed",
          capabilities: this.capabilities,
          checkedAt: Date.now(),
        };
      }
      // Login probe — may fail if distro not installed yet (degraded, not unavailable)
      const login = await this.execFn(
        `proot-distro login ${this.profile} -- sh -lc 'echo AIB_PROOT_OK; uname -m'`,
        { timeoutMs: 20_000 },
      );
      const out = (login.stdout ?? "").trim();
      const code = login.exitCode ?? login.code ?? 1;
      if (code === 0 && out.includes("AIB_PROOT_OK")) {
        return {
          id: this.id,
          health: "ready",
          latencyMs: Date.now() - started,
          detail: `${this.profile} ready | ${out.split("\n").slice(-1)[0] || ""}`,
          capabilities: this.capabilities,
          checkedAt: Date.now(),
        };
      }
      return {
        id: this.id,
        health: "degraded",
        latencyMs: Date.now() - started,
        detail: `proot-distro present; ${this.profile} not ready (${(login.stderr || out).slice(0, 120)})`,
        capabilities: this.capabilities,
        checkedAt: Date.now(),
      };
    } catch (e) {
      return {
        id: this.id,
        health: "unavailable",
        latencyMs: Date.now() - started,
        detail: e instanceof Error ? e.message : String(e),
        capabilities: this.capabilities,
        checkedAt: Date.now(),
      };
    }
  }

  async exec(req: BackendExecRequest): Promise<BackendExecResult> {
    const started = Date.now();
    const cwd = req.cwd && req.cwd.startsWith("/") ? req.cwd : undefined;
    const inner = cwd
      ? `cd '${cwd.replace(/'/g, `'"'"'`)}' && ${req.command}`
      : req.command;
    const wrapped = `proot-distro login ${this.profile} -- sh -lc ${shellQuote(inner)}`;
    const r = await this.execFn(wrapped, { timeoutMs: req.timeoutMs ?? 120_000 });
    return {
      exitCode: r.exitCode ?? r.code ?? 1,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? "",
      durationMs: Date.now() - started,
      backendId: this.id,
    };
  }

  async warmup(): Promise<void> {
    // Ensure distro exists — install is heavy; only attempt if degraded
    const probe = await this.probe();
    if (probe.health === "degraded") {
      await this.execFn(`proot-distro install ${this.profile}`, { timeoutMs: 600_000 });
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
