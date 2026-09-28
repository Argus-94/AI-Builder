/**
 * Phase 27: persistent proot container manager.
 * Userspace containers; no root or daemon required.
 */
import type { ExecutionEnvironment } from "../environment/ExecutionEnvironment";
import type { HomeLayout } from "../home/HomeLayout";
import type { ContainerInstance, ContainerImage, ContainerManager, ContainerPolicy, MountSpec } from "./ContainerTypes";
import { validateProjectName } from "../project-manager";

export type ProotContainerProfile = "debian" | "ubuntu";
export type ProotContainerRecord = ContainerInstance & {
  readonly profile: ProotContainerProfile;
  readonly rootfsPath?: string;
  readonly lastExitCode?: number;
  readonly lastExecAt?: number;
};
export type ContainerExecResult = {
  exitCode: number; stdout: string; stderr: string; command: string; durationMs: number;
};

const MAX_TIMEOUT_MS = 15 * 60_000;
const MIN_TIMEOUT_MS = 1000;
const ALLOWED_COMMANDS = new Set([
  "pwd", "ls", "cat", "head", "tail", "find", "grep", "sed", "awk",
  "node", "npm", "pnpm", "npx", "python", "python3", "pip", "pip3", "git", "java", "javac", "apt-get",
  "gradle", "./gradlew", "which", "uname", "env", "mkdir", "cp", "mv", "rm", "touch",
]);

function shellQuote(value: string): string {
  if (value.includes("\0") || value.length > 4096) throw new Error("Invalid container argument");
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}
function safeName(value: string): string {
  const v = value.trim().replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 64);
  if (!v) throw new Error("CONTAINER_NAME_REQUIRED");
  return v;
}
function isSafeWorkspaceCwd(cwd: string): boolean {
  if (!(cwd === "/workspace" || cwd.startsWith("/workspace/"))) return false;
  return !cwd.split("/").includes("..");
}

function profileFromImage(imageId: string): ProotContainerProfile {
  if (imageId.startsWith("debian:")) return "debian";
  if (imageId.startsWith("ubuntu:")) return "ubuntu";
  throw new Error(`Unsupported proot image: ${imageId}`);
}

export class ProotContainerManager implements ContainerManager {
  private readonly images = new Map<string, ContainerImage>();
  private readonly instances = new Map<string, ProotContainerRecord>();
  private loaded = false;
  private readonly statePath: string;

  constructor(private readonly environment: ExecutionEnvironment, private readonly home: HomeLayout) {
    this.statePath = `${home.metadata}/proot-containers.json`;
  }

  registerImage(image: ContainerImage): void { this.images.set(image.id, image); }
  listImages(): ContainerImage[] { return [...this.images.values()]; }
  listInstances(): ContainerInstance[] { this.ensureLoadedSyncSafe(); return [...this.instances.values()]; }
  get(instanceId: string): ProotContainerRecord | undefined { this.ensureLoadedSyncSafe(); return this.instances.get(instanceId); }

  async create(input: { imageId: string; name: string; mounts?: MountSpec[]; policy?: ContainerPolicy; projectId?: string }): Promise<ContainerInstance> {
    await this.load();
    const image = this.images.get(input.imageId);
    if (!image) throw new Error(`Unknown image: ${input.imageId}`);
    const profile = profileFromImage(input.imageId);
    const projectId = input.projectId ? validateProjectName(input.projectId) : undefined;
    if (!projectId && !(input.mounts ?? []).some((m) => m.containerPath === "/workspace")) {
      throw new Error("PROJECT_OR_WORKSPACE_MOUNT_REQUIRED");
    }
    const id = `proot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const instance: ProotContainerRecord = {
      id, imageId: input.imageId, name: safeName(input.name), status: "created",
      mounts: input.mounts ? [...input.mounts] : [], policy: input.policy ?? "PROJECT_ONLY",
      projectId, createdAt: Date.now(), profile,
      metadata: { backend: "proot-distro", lifecycle: "ephemeral-process" },
    };
    this.instances.set(id, instance);
    await this.save();
    return instance;
  }

  async start(instanceId: string): Promise<void> {
    await this.load();
    const inst = this.require(instanceId);
    const installed = await this.commandExists("proot-distro");
    if (!installed) throw new Error("PROOT_DISTRO_NOT_INSTALLED");
    const profileProbe = await this.environment.exec(
      `proot-distro login ${shellQuote(inst.profile)} -- true`,
      { cwd: this.home.root, timeoutMs: 15_000 },
    );
    if (Number((profileProbe as { exitCode?: number }).exitCode ?? 1) !== 0) {
      const install = await this.environment.exec(
        `proot-distro install ${shellQuote(inst.profile)}`,
        { cwd: this.home.root, timeoutMs: 15 * 60_000 },
      );
      if (Number((install as { exitCode?: number }).exitCode ?? 1) !== 0) {
        throw new Error(`PROOT_PROFILE_NOT_READY:${inst.profile}`);
      }
    }
    this.instances.set(instanceId, { ...inst, status: "running" });
    await this.save();
  }

  async stop(instanceId: string): Promise<void> {
    await this.load();
    const inst = this.require(instanceId);
    this.instances.set(instanceId, { ...inst, status: "stopped" });
    await this.save();
  }

  async restart(instanceId: string): Promise<void> { await this.stop(instanceId); await this.start(instanceId); }

  async remove(instanceId: string): Promise<void> {
    await this.load();
    this.instances.delete(instanceId);
    await this.save();
  }

  async exec(instanceId: string, command: string, args: readonly string[] = [], options: { cwd?: string; timeoutMs?: number } = {}): Promise<ContainerExecResult> {
    await this.load();
    const inst = this.require(instanceId);
    const base = command.trim();
    if (!ALLOWED_COMMANDS.has(base)) throw new Error(`CONTAINER_COMMAND_NOT_ALLOWED: ${command}`);
    const cwd = options.cwd ?? "/workspace";
    if (!isSafeWorkspaceCwd(cwd)) throw new Error("CONTAINER_CWD_MUST_BE_WORKSPACE");
    const timeoutMs = Math.min(MAX_TIMEOUT_MS, Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? 120_000));
    const safeArgs = args.map(shellQuote);
    const inner = `${command} ${safeArgs.join(" ")}`.trim();
    const mounts = this.normalizedMounts(inst);
    const bindArgs = mounts.flatMap((mount) => ["--bind", `${mount.hostPath}:${mount.containerPath}`]);
    const hostCommand = [
      "proot-distro", "login", inst.profile, ...bindArgs, "--", "sh", "-lc",
      `cd ${shellQuote(cwd)} && exec ${inner}`,
    ].map(shellQuote).join(" ");
    const started = Date.now();
    const raw = await this.environment.exec(hostCommand, {
      cwd: this.home.root,
      env: { HOME: this.home.root, AI_BUILDER_HOME: this.home.root, AIB_CONTAINER_ID: inst.id },
      timeoutMs,
    });
    const r = raw as { exitCode?: number; stdout?: string; stderr?: string };
    const result = { exitCode: Number(r.exitCode ?? 0), stdout: String(r.stdout ?? ""), stderr: String(r.stderr ?? ""), command: hostCommand, durationMs: Date.now() - started };
    this.instances.set(instanceId, { ...inst, status: result.exitCode === 0 ? "running" : "error", lastExitCode: result.exitCode, lastExecAt: Date.now() });
    await this.save();
    return result;
  }

  async inspect(instanceId: string): Promise<ProotContainerRecord> {
    await this.load();
    const inst = this.require(instanceId);
    if (!(await this.commandExists("proot-distro"))) return inst;
    try {
      const result = await this.environment.exec(`proot-distro login ${shellQuote(inst.profile)} -- sh -lc ${shellQuote("uname -a && id")}`, { cwd: this.home.root, timeoutMs: 15_000 });
      const r = result as { exitCode?: number };
      return { ...inst, status: Number(r.exitCode ?? 1) === 0 ? "running" : "error" };
    } catch { return inst; }
  }

  private require(id: string): ProotContainerRecord { const inst = this.instances.get(id); if (!inst) throw new Error(`Unknown container: ${id}`); return inst; }
  private normalizedMounts(inst: ProotContainerRecord): MountSpec[] {
    const projectRoot = inst.projectId ? `${this.home.projects.replace(/[\\/]+$/, "")}/${inst.projectId}` : undefined;
    const configured = inst.mounts.length ? inst.mounts : (projectRoot ? [{ hostPath: projectRoot, containerPath: "/workspace", mode: "rw" as const }] : []);
    return configured.map((mount) => {
      const host = mount.hostPath.replace(/[\\/]+$/, "");
      const projectsRoot = this.home.projects.replace(/[\\/]+$/, "");
      if (host.includes("..") || !(host === projectsRoot || host.startsWith(`${projectsRoot}/`))) throw new Error("CONTAINER_MOUNT_HOST_OUTSIDE_PROJECTS");
      if (!(mount.containerPath === "/workspace" || mount.containerPath.startsWith("/workspace/"))) throw new Error("CONTAINER_MOUNT_PATH_INVALID");
      if (!/^(ro|rw)$/.test(mount.mode)) throw new Error("CONTAINER_MOUNT_MODE_INVALID");
      return { ...mount, hostPath: host };
    });
  }

  private async commandExists(command: string): Promise<boolean> {
    try { const r = await this.environment.exec(`command -v ${shellQuote(command)}`, { timeoutMs: 5000 }); return Number((r as { exitCode?: number }).exitCode ?? 1) === 0; } catch { return false; }
  }
  private ensureLoadedSyncSafe(): void { /* persisted state is loaded by async operations; constructor remains side-effect free */ }
  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      if (!(await this.environment.exists(this.statePath))) return;
      const raw = await this.environment.read(this.statePath);
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) for (const item of parsed) if (item && typeof item === "object" && typeof (item as any).id === "string") this.instances.set((item as any).id, item as ProotContainerRecord);
    } catch { this.instances.clear(); }
  }
  private async save(): Promise<void> {
    await this.environment.mkdir(this.home.metadata);
    await this.environment.write(this.statePath, JSON.stringify([...this.instances.values()], null, 2));
  }
}

export function createProotContainerManager(environment: ExecutionEnvironment, home: HomeLayout): ProotContainerManager {
  return new ProotContainerManager(environment, home);
}
