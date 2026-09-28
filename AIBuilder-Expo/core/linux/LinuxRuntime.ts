/**
 * Linux userspace runtime for Android/Termux.
 * Primary backend: proot-distro (no root required).
 * Projects remain on the AIBuilder host and are mounted at /workspace.
 */
import type { ExecutionEnvironment } from "../environment/ExecutionEnvironment";
import type { HomeLayout } from "../home/HomeLayout";
import { rootfsCandidates } from "../container/RootfsDiscovery";

export type LinuxRuntimeProfile = "debian" | "ubuntu";
export type LinuxRuntimeStatus = {
  available: boolean;
  backend: "proot-distro" | "rootfs" | "unavailable";
  profile: LinuxRuntimeProfile;
  prootDistroInstalled: boolean;
  rootfsPath?: string;
  message: string;
};
export type LinuxExecResult = { exitCode: number; stdout: string; stderr: string; command: string; durationMs: number };

const ALLOWED_COMMANDS = new Set([
  "pwd", "ls", "cat", "head", "tail", "find", "grep", "sed", "awk",
  "node", "npm", "pnpm", "npx", "python", "python3", "pip", "pip3", "git", "java", "javac",
  "gradle", "./gradlew", "which", "uname", "env",
]);

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}
function normalizeArgs(args: readonly string[]): string[] {
  return args.map((arg) => {
    if (arg.includes("\0") || arg.length > 4096) throw new Error("Invalid Linux argument");
    return arg;
  });
}
function isAllowed(command: string): boolean {
  return ALLOWED_COMMANDS.has(command.trim());
}

function isSafeCwd(cwd: string): boolean {
  if (cwd === "/tmp" || cwd === "/workspace") return true;
  if (!cwd.startsWith("/workspace/")) return false;
  const parts = cwd.split("/");
  return !parts.includes("..") && !parts.includes("");
}

export class LinuxRuntime {
  constructor(private readonly environment: ExecutionEnvironment, private readonly home: HomeLayout) {}

  private async commandExists(command: string): Promise<boolean> {
    try {
      const result = await this.environment.exec(`command -v ${shellQuote(command)}`, { timeoutMs: 5000 });
      return Number((result as { exitCode?: number })?.exitCode ?? 1) === 0;
    } catch { return false; }
  }

  private async findRootfs(profile: LinuxRuntimeProfile): Promise<string | undefined> {
    const candidates = profile === "ubuntu"
      ? rootfsCandidates(this.home, "ubuntu")
      : [
          `${this.home.containers}/debian/images/base/rootfs`,
          `${this.home.containers}/debian/images/base`,
          `${this.home.containers}/images/debian/rootfs`,
          `${this.home.containers}/images/debian`,
        ];
    for (const candidate of candidates) {
      if (await this.environment.exists(candidate)) return candidate;
    }
    return undefined;
  }

  async status(profile: LinuxRuntimeProfile = "debian"): Promise<LinuxRuntimeStatus> {
    const prootDistroInstalled = await this.commandExists("proot-distro");
    const rootfsPath = await this.findRootfs(profile);
    if (prootDistroInstalled) return { available: true, backend: "proot-distro", profile, prootDistroInstalled: true, rootfsPath, message: "proot-distro is available; Linux userspace can run without root." };
    if (rootfsPath) {
      const prootInstalled = await this.commandExists("proot");
      if (prootInstalled) return { available: true, backend: "rootfs", profile, prootDistroInstalled: false, rootfsPath, message: "A local rootfs and proot were found; direct proot execution is available." };
    }
    return { available: false, backend: "unavailable", profile, prootDistroInstalled: false, message: "Install proot-distro in Termux or provision a local rootfs." };
  }

  async bootstrap(profile: LinuxRuntimeProfile = "debian"): Promise<LinuxExecResult> {
    if (profile !== "debian") throw new Error("Phase 26 bootstrap currently supports Debian via proot-distro");
    if (!(await this.commandExists("proot-distro"))) throw new Error("proot-distro is not installed in Termux");
    return this.runHostCommand("proot-distro", ["install", "debian"], 15 * 60_000);
  }

  async exec(command: string, args: readonly string[] = [], options: { profile?: LinuxRuntimeProfile; cwd?: string; timeoutMs?: number } = {}): Promise<LinuxExecResult> {
    if (!isAllowed(command)) throw new Error(`Linux command not allowed: ${command}`);
    const safeArgs = normalizeArgs(args);
    const profile = options.profile ?? "debian";
    const status = await this.status(profile);
    if (!status.available) throw new Error(status.message);
    const inner = `${command} ${safeArgs.map(shellQuote).join(" ")}`.trim();
    const cwd = options.cwd ?? "/workspace";
    if (!isSafeCwd(cwd)) throw new Error("Linux cwd must stay inside /workspace or /tmp");
    await this.environment.mkdir(this.home.workspace);
    if (status.backend === "proot-distro") {
      return this.runHostCommand("proot-distro", ["login", profile, "--bind", `${this.home.workspace}:/workspace`, "--", "sh", "-lc", `cd ${shellQuote(cwd)} && exec ${inner}`], options.timeoutMs ?? 120_000);
    }
    const commandLine = ["proot", "-0", "-r", shellQuote(status.rootfsPath!), "-b", `${shellQuote(this.home.workspace)}:/workspace`, "-w", shellQuote(cwd), "--", "sh", "-lc", shellQuote(inner)].join(" ");
    return this.runHostCommandLine(commandLine, options.timeoutMs ?? 120_000);
  }

  private async runHostCommand(command: string, args: readonly string[], timeoutMs: number): Promise<LinuxExecResult> {
    return this.runHostCommandLine([command, ...args.map(shellQuote)].join(" "), timeoutMs);
  }
  private async runHostCommandLine(commandLine: string, timeoutMs: number): Promise<LinuxExecResult> {
    const started = Date.now();
    const result = await this.environment.exec(commandLine, { cwd: this.home.root, env: { HOME: this.home.root, AI_BUILDER_HOME: this.home.root }, timeoutMs });
    const r = result as { exitCode?: number; stdout?: string; stderr?: string };
    return { exitCode: Number(r?.exitCode ?? 0), stdout: String(r?.stdout ?? ""), stderr: String(r?.stderr ?? ""), command: commandLine, durationMs: Date.now() - started };
  }
}
