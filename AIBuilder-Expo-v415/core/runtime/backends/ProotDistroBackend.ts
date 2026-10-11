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
import { wrapHardenedShellBody } from "../../enhancements/isolation/HardenedProotOptions";
import { buildProxySafeEnvironment, ProotCommandError } from "../../container/ProotCommandBuilder";
import { buildProotDistroInstallCommand, buildProotDistroProbeCommand, parseProotDistroProbe, withProotDistroInstallLock } from "../../../lib/proot-distro-state";

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
    private profile: ProotProfile = "debian",
  ) {}

  setProfile(profile: ProotProfile): void {
    this.profile = profile;
  }

  async probe(): Promise<BackendProbeResult> {
    const started = Date.now();
    const profile = this.profile;
    try {
      const inspected = await this.inspectProfile(profile, 20_000);
      const { state } = inspected;
      if (state.healthy) {
        return {
          id: this.id,
          health: "ready",
          latencyMs: Date.now() - started,
          detail: `${profile} ready | id=${state.osReleaseId} uname=${state.uname}`,
          capabilities: this.capabilities,
          checkedAt: Date.now(),
        };
      }
      const explicitMissingTool = inspected.output.includes("AIB_PROOT_TOOL:MISSING");
      return {
        id: this.id,
        health: explicitMissingTool ? "unavailable" : "degraded",
        latencyMs: Date.now() - started,
        detail: state.installed === true
          ? `${profile} is listed as installed but login/identity validation failed; rootfs preserved.`
          : state.installed === false
            ? `${profile} is confirmed absent; guarded install is available.`
            : `${profile} state is unverified; no install/reset is allowed.`,
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
    const env = Object.entries(buildProxySafeEnvironment(req.env ?? {}, req.credentialProxy));
    for (const [key, value] of env) {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) || value.includes("\0")) {
        throw new ProotCommandError("BACKEND_ENV_INVALID");
      }
    }
    const exports = env.map(([key, value]) => `export ${key}=${shellQuote(value)};`).join(" ");
    const command = `${exports}${exports ? " " : ""}${req.command}`;
    const inner = cwd
      ? `cd '${cwd.replace(/'/g, `\"'\"'`)}' && ${command}`
      : command;
    const hardened = wrapHardenedShellBody(inner, req.hardening);
    const wrapped = `proot-distro login ${this.profile} -- ${hardened}`;
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
    const profile = this.profile;
    // Only the shared builder may install, and only when proot-distro explicitly
    // confirms the selected alias is absent. Broken/unknown roots are preserved.
    const initial = await this.inspectProfile(profile, 20_000);
    if (initial.state.healthy) return;
    if (initial.state.installed !== false) {
      throw new Error(initial.state.installed === true
        ? `PROOT_PROFILE_INSTALLED_LOGIN_FAILED:${profile}; existing rootfs preserved; no reinstall/reset attempted`
        : `PROOT_PROFILE_STATE_UNVERIFIED:${profile}; no install/reset attempted`);
    }
    await withProotDistroInstallLock(profile, async () => {
      const current = await this.inspectProfile(profile, 20_000);
      if (current.state.healthy) return;
      if (current.state.installed !== false) {
        throw new Error(current.state.installed === true
          ? `PROOT_PROFILE_INSTALLED_LOGIN_FAILED:${profile}; existing rootfs preserved; no reinstall/reset attempted`
          : `PROOT_PROFILE_STATE_UNVERIFIED:${profile}; no install/reset attempted`);
      }
      const install = await this.execFn(buildProotDistroInstallCommand(profile), { timeoutMs: 45 * 60_000 });
      const exitCode = install.exitCode ?? install.code ?? 1;
      if (exitCode !== 0) throw new Error(`PROOT_PROFILE_BOOTSTRAP_REFUSED_OR_FAILED:${profile}:${(install.stderr || install.stdout || "").slice(-1000)}`);
      const verified = await this.inspectProfile(profile, 20_000);
      if (!verified.state.healthy) throw new Error(`PROOT_PROFILE_LOGIN_FAILED:${profile}:${verified.state.diagnostic}`);
    });
  }

  private async inspectProfile(profile: ProotProfile, timeoutMs: number) {
    try {
      const raw = await this.execFn(buildProotDistroProbeCommand(profile), { timeoutMs });
      const output = `${raw.stdout ?? ""}\n${raw.stderr ?? ""}`;
      const exitCode = Number(raw.exitCode ?? raw.code ?? -1);
      return { output, state: parseProotDistroProbe(profile, output, exitCode) };
    } catch (error) {
      const output = error instanceof Error ? error.message : String(error);
      return { output, state: parseProotDistroProbe(profile, output, -1) };
    }
  }
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
