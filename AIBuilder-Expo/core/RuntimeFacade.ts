/**
 * Unified runtime facade for AIBuilderTermux.
 * Wires HOME → Environment → Project → Terminal → Toolchains →
 * Process/Session → Containers → Agent → Bridge → Privilege → Native.
 * Runtime-only; does not alter compilation settings.
 */

import { createHomeLayout, type HomeLayout } from "./home/HomeLayout";
import { validateProjectName } from "./project-manager";
import { createHomeEnvironment } from "./home/HomeEnvironment";
import { AIBuilderTermuxEnvironment } from "./environment/AIBuilderTermuxEnvironment";
import type { ExecutionEnvironment } from "./environment/ExecutionEnvironment";
import { persistentLogger } from "../lib/persistent-logger";
import { createProcessRegistry, type ProcessRegistry } from "./process/ProcessRegistry";
import { createLockManager, type LockManager } from "./process/LockManager";
import { createSessionManager, type SessionManager } from "./session/SessionManager";
import { createToolchainManager, type ToolchainManager } from "./toolchain/ToolchainManager";
import {
  createUserspaceContainerBackend,
  type UserspaceContainerBackend,
} from "./container/UserspaceContainerBackend";
import { ubuntuImageManifest } from "./ubuntu/UbuntuProfile";
import { kaliImageManifest } from "./container/KaliProfile";
import { buildContainerShellSpec } from "./container/ContainerShell";
import { buildProotLaunchPlan } from "./container/ProotCommandBuilder";
import { discoverRootfsPath } from "./container/RootfsDiscovery";
import { detectDevicePrivileges } from "./privilege/DevicePrivilegeDetection";
import { buildRootfsImageManifest, isRootfsReady } from "./container/RootfsImageManifest";
import { ensureRootfsLayout } from "./container/RootfsEnsure";
import { createAgentManager, type AgentManager } from "./agent/AgentManager";
import {
  createInMemoryAndroidBridge,
  type InMemoryAndroidBridge,
} from "./bridge/AndroidBridge";
import {
  NoneProvider,
  ShizukuProvider,
  RootProvider,
  detectPrivileges,
  type CapabilityDetection,
  type PrivilegeProvider,
} from "./privilege/PrivilegeProvider";
import {
  createNativeContainerRuntime,
  type DefaultNativeContainerRuntime,
} from "./native/NativeContainerRuntime";
import { createRecoveryManager, type RecoveryManager } from "./recovery/RecoveryManager";
import { buildDiagnosticReport, type DiagnosticReport } from "./diagnostics/DiagnosticReport";
import {
  runFinalValidation,
  type FinalValidationReport,
} from "./FinalValidation";
import { TerminalSessionManager } from "./terminal-session-manager";
import type { TerminalAdapter } from "./terminal";
import { createTermuxTerminalBackend } from "./environment/TermuxTerminalBackend";
import { CURRENT_RUNTIME_IDENTITY, type RuntimeIdentity } from "./runtime/RuntimeIdentity";
import { RuntimeTaskGate } from "./runtime/RuntimeTaskGate";
import { RuntimeJournal } from "./runtime/RuntimeJournal";
import { EnvironmentTextStore } from "./runtime/RuntimeStores";
import { BootstrapPipeline, createBootstrapPipeline, type BootstrapPipelineState, type BootstrapProgressEvent } from "./runtime/BootstrapPipeline";
import { RuntimeSupervisor } from "./runtime/RuntimeSupervisor";
import { RuntimeTransaction } from "./runtime/RuntimeTransaction";
import { createAibUserspaceRuntime, type AibUserspaceRuntime } from "./runtime/AibUserspaceRuntime";
import { RuntimeMaintenanceCoordinator } from "./runtime/RuntimeMaintenanceCoordinator";
import {
  probeJava,
  probeGradle,
  probeNode,
  probeAdb,
  probeSdk,
  probeProotDistro,
  probeTermuxSession,
  probeDiskFree,
  probeGit,
  probeUnzip,
  probeDebianDistro,
  probeHomeLayout,
  probeNdk,
  probeAapt2,
  probeShizuku,
} from "./diagnostics/LiveProbes";
import {
  createGradleRule,
  createJavaRule,
  createNodeRule,
  createSdkRule,
} from "./diagnostics/rules/BuiltinRules";
import { RuntimeHealth } from "./diagnostics/RuntimeHealth";
import { StartupTrace } from "./diagnostics/StartupTrace";
import { FailureJournal } from "./diagnostics/FailureJournal";
import {
  createIdentityRule,
  createJournalPendingRule,
  createSelfTestRule,
  createProotRule,
  createAdbRule,
  createUserspaceRuntimeRule,
  createTermuxSessionRule,
  createDiskFreeRule,
  createGitRule,
  createUnzipRule,
  createDebianDistroRule,
  createHomeLayoutRule,
  createNdkRule,
  createAapt2Rule,
  createShizukuRule,
  createSupervisorRule,
} from "./diagnostics/rules/BuiltinRules";
import { BackupManager } from "./backup/BackupManager";
import { createDeterministicRepair, type DeterministicRepair } from "./recovery/DeterministicRepair";
import { TermuxBackupAdapter } from "./backup/TermuxBackupAdapter";
import { UnavailableDeviceAgentBridge, type DeviceAgentBridge } from "./device/DeviceAgentBridge";
import { DeviceAgentTools } from "./device/DeviceAgentTools";
import { runDeviceAppLoop, type DeviceAppLoopOptions, type DeviceAppLoopResult } from "./device/DeviceAppLoop";
import { DeviceAutomationAgent, type DeviceAutomationOptions, type DeviceAutomationResult } from "./device/DeviceAutomationAgent";
import { generateDeviceTestSuite, type DeviceTestSuite, type TestPlanModel } from "./device/DeviceTestPlanner";
import { DeviceEvidenceStore } from "./device/DeviceEvidenceStore";
import { runDeviceTestSuite, type DeviceTestSuiteRun } from "./device/DeviceTestRunner";
import { LinuxRuntime, type LinuxExecResult, type LinuxRuntimeProfile, type LinuxRuntimeStatus } from "./linux/LinuxRuntime";
import { createProotContainerManager, type ProotContainerManager, type ContainerExecResult } from "./container/ProotContainerManager";
import { DEBIAN_IMAGE, UBUNTU_IMAGE } from "./container/ContainerProfiles";
import { createAIWorkspaceBuilder, type WorkspaceBuildPlan, type WorkspaceBuildResult } from "./workspace/AIWorkspaceBuilder";
import { createAIProjectGenerator, type AIProjectRequest, type AIProjectResult } from "./workspace/AIProjectGenerator";
import { createAICodingAgent, type AICodingAgentRequest, type AICodingAgentResult } from "./workspace/AICodingAgent";
import { createLLMCodingBrain, type LLMCodingBrain } from "./workspace/LLMCodingBrain";
import { runAgenticBuildLoop, type AgenticBuildLoopRequest, type AgenticBuildLoopResult } from "./workspace/AgenticBuildLoop";
import { runRealDeviceIntegration, type RealDeviceIntegrationRequest, type RealDeviceIntegrationResult } from "./device/RealDeviceIntegration";
import { createPersistentAIWorkspace, type PersistentAIWorkspace, type PersistentWorkspaceSnapshot, type PersistentWorkspaceStatus, type WorkspaceGitEntry } from "./workspace/PersistentAIWorkspace";
import { createAIProjectMemory, type AIProjectMemoryStore, type AIProjectMemory } from "./workspace/AIProjectMemory";
import { createOneClickAppFactory, type OneClickAppFactoryRequest, type OneClickAppFactoryResult } from "./workspace/OneClickAppFactory";

export type RuntimeFacadeOptions = {
  homeRoot?: string;
  shizukuAvailable?: boolean;
  rootAvailable?: boolean;
  terminalAdapter?: TerminalAdapter;
  runtimeIdentity?: RuntimeIdentity;
  deviceBridge?: DeviceAgentBridge;
};

export class RuntimeFacade {
  readonly home: HomeLayout;
  readonly environment: ExecutionEnvironment;
  readonly processRegistry: ProcessRegistry;
  readonly locks: LockManager;
  readonly sessions: SessionManager;
  readonly toolchains: ToolchainManager;
  readonly containers: UserspaceContainerBackend;
  readonly linux: LinuxRuntime;
  readonly containerRuntime: ProotContainerManager;
  readonly workspaceBuilder: ReturnType<typeof createAIWorkspaceBuilder>;
  readonly projectGenerator: ReturnType<typeof createAIProjectGenerator>;
  readonly codingAgent: ReturnType<typeof createAICodingAgent>;
  readonly codingBrain: LLMCodingBrain;
  readonly persistentWorkspace: PersistentAIWorkspace;
  readonly projectMemory: AIProjectMemoryStore;
  readonly oneClickAppFactory: ReturnType<typeof createOneClickAppFactory>;
  readonly agents: AgentManager;
  readonly bridge: InMemoryAndroidBridge;
  readonly privileges: {
    none: PrivilegeProvider;
    shizuku: PrivilegeProvider;
    root: PrivilegeProvider;
  };
  readonly native: DefaultNativeContainerRuntime;
  readonly recovery: RecoveryManager;
  readonly terminals: TerminalSessionManager | null;
  readonly runtimeIdentity: RuntimeIdentity;
  readonly taskGate: RuntimeTaskGate;
  readonly journal: RuntimeJournal;
  readonly supervisor: RuntimeSupervisor;
  readonly health: RuntimeHealth;
  readonly transaction: RuntimeTransaction;
  readonly userspace: AibUserspaceRuntime;
  readonly maintenance: RuntimeMaintenanceCoordinator;
  readonly startupTrace: StartupTrace;
  readonly failureJournal: FailureJournal;
  readonly bootstrapPipeline: BootstrapPipeline;
  readonly deterministicRepair: DeterministicRepair;
  readonly backups: BackupManager;
  device: DeviceAgentBridge;
  deviceTools: DeviceAgentTools;
  deviceAutomation: DeviceAutomationAgent;

  private privilegeSnapshot: CapabilityDetection | null = null;

  constructor(options: RuntimeFacadeOptions = {}) {
    const homeEnv = createHomeEnvironment(
      options.homeRoot ? { AI_BUILDER_HOME: options.homeRoot } : {},
    );
    this.home = homeEnv.layout;
    this.runtimeIdentity = options.runtimeIdentity ?? CURRENT_RUNTIME_IDENTITY;
    this.taskGate = new RuntimeTaskGate({ drainTimeoutMs: 15_000 });
    this.journal = new RuntimeJournal(new EnvironmentTextStore(
      new AIBuilderTermuxEnvironment(this.home.root),
      `${this.home.metadata}/runtime-journal.json`,
    ));
    this.transaction = new RuntimeTransaction(this.taskGate, this.journal);
    this.userspace = createAibUserspaceRuntime(
      async (command, opts) => {
        const r = await this.environment.exec(command, {
          cwd: opts?.cwd ?? this.home.root,
          timeoutMs: opts?.timeoutMs ?? 60_000,
        });
        return {
          exitCode: (r as { exitCode?: number }).exitCode ?? (r as { code?: number }).code ?? 0,
          stdout: (r as { stdout?: string }).stdout ?? "",
          stderr: (r as { stderr?: string }).stderr ?? "",
        };
      },
      this.taskGate,
      { prootProfile: "debian", policy: "prefer-priority" },
    );
    this.startupTrace = new StartupTrace(new EnvironmentTextStore(
      new AIBuilderTermuxEnvironment(this.home.root),
      `${this.home.metadata}/startup-trace.json`,
    ));
    this.failureJournal = new FailureJournal(new EnvironmentTextStore(
      new AIBuilderTermuxEnvironment(this.home.root),
      `${this.home.metadata}/failure-journal.json`,
    ));
    // Bootstrap pipeline store only — runner injected lazily via lib to avoid native import cycles
    this.bootstrapPipeline = createBootstrapPipeline(
      new EnvironmentTextStore(
        new AIBuilderTermuxEnvironment(this.home.root),
        `${this.home.metadata}/bootstrap-pipeline.json`,
      ),
      async () => ({ ok: false, message: "Bootstrap runner not bound" }),
    );
    this.deterministicRepair = createDeterministicRepair();

    this.environment = new AIBuilderTermuxEnvironment(this.home.root);
    this.processRegistry = createProcessRegistry();
    this.maintenance = new RuntimeMaintenanceCoordinator(
      this.taskGate,
      this.journal,
      this.processRegistry,
      {},
    );
    this.locks = createLockManager();
    this.sessions = createSessionManager();
    this.toolchains = createToolchainManager();
    this.containers = createUserspaceContainerBackend();
    this.containers.registerImage(ubuntuImageManifest(this.home));
    this.containers.registerImage(kaliImageManifest(this.home));
    this.linux = new LinuxRuntime(this.environment, this.home);
    this.containerRuntime = createProotContainerManager(this.environment, this.home);
    this.containerRuntime.registerImage(DEBIAN_IMAGE);
    this.containerRuntime.registerImage(UBUNTU_IMAGE);
    this.workspaceBuilder = createAIWorkspaceBuilder(this.containerRuntime);
    this.projectGenerator = createAIProjectGenerator(this.containerRuntime, this.workspaceBuilder);
    this.codingAgent = createAICodingAgent(this.containerRuntime, this.workspaceBuilder);
    this.codingBrain = createLLMCodingBrain(this.containerRuntime);
    this.persistentWorkspace = createPersistentAIWorkspace(this.environment, this.home);
    this.projectMemory = createAIProjectMemory(this.environment, this.home);
    this.oneClickAppFactory = createOneClickAppFactory(this);
    this.agents = createAgentManager(this.environment);
    this.bridge = createInMemoryAndroidBridge();
    this.privileges = {
      none: new NoneProvider(),
      shizuku: new ShizukuProvider(options.shizukuAvailable ?? false),
      root: new RootProvider(options.rootAvailable ?? false),
    };
    this.native = createNativeContainerRuntime();
    this.recovery = createRecoveryManager();
    this.supervisor = new RuntimeSupervisor(this.processRegistry, async (process) => {
      try {
        await this.failureJournal.record(
          "WATCHDOG_HEALTH_FAILED",
          process.kind || "process",
          `watchdog failed: ${process.id} (${process.label || ""})`,
          { processId: process.id, kind: process.kind || "" },
        );
      } catch {
        /* non-fatal */
      }
      this.processRegistry.unregister(process.id);
    });
    this.health = new RuntimeHealth(this.failureJournal);
    this.device = options.deviceBridge ?? new UnavailableDeviceAgentBridge();
    this.deviceTools = new DeviceAgentTools(this.device);
    this.deviceAutomation = new DeviceAutomationAgent(this.device);
    this.backups = new BackupManager(
      this.home,
      this.runtimeIdentity,
      new TermuxBackupAdapter(this.environment, this.home),
      this.taskGate,
      this.journal,
    );
    const terminalAdapter =
      options.terminalAdapter ?? createTermuxTerminalBackend(this.environment);
    this.terminals = new TerminalSessionManager(terminalAdapter);

    this.agents.setHostHooks({
      openTerminalForProject: (projectId) => this.openTerminalForProject(projectId),
      runShell: async (command, opts) => {
        const result = await this.environment.exec(command, {
          cwd: opts?.cwd,
          env: opts?.env,
        });
        if (result && typeof result === "object") {
          const r = result as {
            exitCode?: number;
            stdout?: string;
            stderr?: string;
          };
          return {
            exitCode: r.exitCode ?? 0,
            stdout: r.stdout ?? "",
            stderr: r.stderr ?? "",
          };
        }
        return { exitCode: 0, stdout: String(result ?? ""), stderr: "" };
      },
      runDeviceAutomation: (options) => this.runDeviceAutomation(options),
    });

    this.registerDefaultRecoveryActions();
    this.registerHealthChecks();
  }


  private registerHealthChecks(): void {
    this.health.registerRule(createSelfTestRule());
    this.health.registerRule(createIdentityRule(this.runtimeIdentity));
    this.health.registerRule(createUserspaceRuntimeRule(async () => {
      const s = await this.userspace.status();
      return { ready: s.ready, activeBackend: s.activeBackend, detail: s.probes.map(p => `${p.id}:${p.health}`).join(",") };
    }));

    const termuxExec = async (command: string, opts?: { timeoutMs?: number; cwd?: string }) => {
      const r = await this.environment.exec(command, {
        cwd: opts?.cwd ?? this.home.root,
        timeoutMs: opts?.timeoutMs ?? 15_000,
      });
      return {
        exitCode: (r as { exitCode?: number }).exitCode ?? (r as { code?: number }).code ?? 0,
        stdout: (r as { stdout?: string }).stdout ?? "",
        stderr: (r as { stderr?: string }).stderr ?? "",
      };
    };
    this.health.registerRule(createJavaRule(() => probeJava(termuxExec)));
    this.health.registerRule(createGradleRule(() => probeGradle(termuxExec)));
    this.health.registerRule(createNodeRule(() => probeNode(termuxExec)));
    this.health.registerRule(createSdkRule(() => probeSdk(termuxExec)));
    this.health.registerRule(createAdbRule(() => probeAdb(termuxExec)));
    this.health.registerRule(createProotRule(() => probeProotDistro(termuxExec)));
    this.health.registerRule(createTermuxSessionRule(() => probeTermuxSession(termuxExec)));
    this.health.registerRule(createDiskFreeRule(() => probeDiskFree(termuxExec)));
    this.health.registerRule(createGitRule(() => probeGit(termuxExec)));
    this.health.registerRule(createUnzipRule(() => probeUnzip(termuxExec)));
    this.health.registerRule(createDebianDistroRule(() => probeDebianDistro(termuxExec)));
    this.health.registerRule(createHomeLayoutRule(() => probeHomeLayout(termuxExec)));
    this.health.registerRule(createNdkRule(() => probeNdk(termuxExec)));
    this.health.registerRule(createAapt2Rule(() => probeAapt2(termuxExec)));
    this.health.registerRule(createShizukuRule(() => probeShizuku(termuxExec)));
    this.health.registerRule(createSupervisorRule(async () => {
      const s = this.supervisor.snapshot();
      if (s.status === "stopped") {
        return { ok: false, detail: "Supervisor stopped — open Runtime and Start" };
      }
      if (s.status === "quarantined" || s.status === "degraded") {
        return { ok: true, detail: `Supervisor ${s.status} · watched=${s.watched}`, warn: true };
      }
      return { ok: true, detail: `Supervisor ${s.status} · watched=${s.watched}` };
    }));
    this.health.registerRule(createJournalPendingRule(async () => (await this.journal.pending()).length));
    this.health.register({
      id: "home",
      check: async () => ({ level: "ok" as const, id: "home", message: `HOME=${this.home.root}`, repairable: false, checkedAt: Date.now() }),
    });
  }

  /** Recover unfinished journal entries from a previous crash. */
  async recoverPendingTransactions(): Promise<{ recovered: number; failed: number }> {
    return this.transaction.recoverPending(async (entry) => {
      await this.failureJournal.record("JOURNAL_PENDING", entry.operation, `Recovered stale transaction ${entry.id}`);
      return "rolled_back";
    });
  }

  async runRuntimeTask<T>(owner: string, fn: () => Promise<T> | T): Promise<T> {
    return this.taskGate.run("normal", owner, fn);
  }

  async runMaintenance<T>(owner: string, fn: () => Promise<T> | T): Promise<T> {
    return this.taskGate.run("maintenance", owner, fn);
  }

  async initUserspaceRuntime() {
    return this.userspace.initialize();
  }

  async userspaceStatus() {
    return this.userspace.status();
  }

  async userspaceExec(command: string, opts?: { cwd?: string; timeoutMs?: number }) {
    return this.userspace.exec({ command, cwd: opts?.cwd, timeoutMs: opts?.timeoutMs });
  }


  /** Keep a logical termux-bridge process in registry for supervisor (plan A2/A3). */
  ensureTermuxBridgeWatch(ok: boolean, detail?: string): void {
    const id = "termux-bridge-session";
    if (!ok) {
      // Keep entry so supervisor can see failed health; mark failed
      if (this.processRegistry.get(id)) {
        this.processRegistry.patchMetadata(id, {
          health: "failed",
          detail: (detail || "session-down").slice(0, 120),
        });
      } else {
        this.processRegistry.register({
          id,
          kind: "runtime",
          startedAt: Date.now(),
          label: detail || "termux-session",
          metadata: { watchdog: "true", source: "health", health: "failed" },
        });
      }
      return;
    }
    const existing = this.processRegistry.get(id);
    if (existing) {
      this.processRegistry.patchMetadata(id, {
        health: "ok",
        detail: (detail || "session-ok").slice(0, 120),
      });
      return;
    }
    this.processRegistry.register({
      id,
      kind: "runtime",
      startedAt: Date.now(),
      label: detail || "termux-session",
      metadata: { watchdog: "true", source: "health", health: "ok" },
    });
  }

  startSupervisor(intervalMs = 5000): void { this.supervisor.start(intervalMs); }
  stopSupervisor(): void { this.supervisor.stop(); }
  clearSupervisorQuarantine(processId?: string): void {
    this.supervisor.clearQuarantine(processId);
  }

  async shizukuSelfCheck(): Promise<{ ok: boolean; message: string }> {
    const { shizukuSelfCheck } = await import("../lib/shizuku-bridge");
    return shizukuSelfCheck();
  }

  async shizukuExec(command: string): Promise<{ exitCode: number; stdout: string; stderr: string; via: string }> {
    const { shizukuExec } = await import("../lib/shizuku-bridge");
    return shizukuExec(command);
  }


  async createBackup(scope: "full" | "projects" | "sessions" | "agent" | "toolchains", destination: string) { return this.backups.create(scope, destination); }
  async restoreBackup(source: string, options?: { preBackupDestination?: string; skipPreBackup?: boolean }) {
    return this.backups.restore(source, options);
  }
  async inspectBackup(source: string) { return this.backups.inspect(source); }
  async listBackups(parentDir?: string) { return this.backups.list(parentDir); }
  async runHealthChecks() {
    const rows = await this.health.run();
    const session = rows.find((r) => r.id === "runtime.termux-session");
    if (session) {
      this.ensureTermuxBridgeWatch(session.level === "ok" || session.level === "info", session.message);
    }
    // Persist non-ok repairable results for later targeting
    for (const r of rows) {
      if (r.level === "error" || (r.level === "warn" && r.repairable)) {
        try {
          await this.failureJournal.record(
            r.level === "error" ? "HEALTH_ERROR" : "HEALTH_WARN",
            r.id,
            r.message,
            { level: r.level, repairable: String(!!r.repairable) },
          );
        } catch {
          /* non-fatal */
        }
      }
    }
    return rows;
  }

  /** Plan B4: export Health snapshot to home.logs/health-*.json */

  /** P2: durable profile zip (metadata/projects) — survive uninstall when stored off-app. */
  async exportProfile(destPath?: string): Promise<{ ok: boolean; path?: string; message: string }> {
    const { exportProfileZip, defaultProfileExportPath } = await import("../lib/profile-transfer");
    const dest =
      (destPath && destPath.trim()) ||
      defaultProfileExportPath(this.home.root);
    return exportProfileZip(dest, this.home.root);
  }

  async importProfile(sourcePath: string): Promise<{ ok: boolean; path?: string; message: string }> {
    const { importProfileZip } = await import("../lib/profile-transfer");
    return importProfileZip(sourcePath, this.home.root);
  }

  async exportHealthReport(): Promise<{ path: string; count: number }> {
    const rows = await this.health.run();
    const session = rows.find((r) => r.id === "runtime.termux-session");
    if (session) {
      this.ensureTermuxBridgeWatch(session.level === "ok" || session.level === "info", session.message);
    }
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const dir = this.home.logs;
    const path = `${dir}/health-${stamp}.json`;
    let privileges = null as unknown;
    try {
      privileges = await this.refreshPrivileges();
    } catch {
      privileges = this.getPrivileges();
    }
    let userspace: unknown = null;
    try {
      userspace = await this.userspace.status();
    } catch {
      userspace = null;
    }
    let openFailures: unknown[] = [];
    try {
      openFailures = await this.failureJournal.openFailures();
    } catch {
      openFailures = [];
    }
    const payload = {
      version: 2,
      appVersion: this.runtimeIdentity.appVersion,
      exportedAt: new Date().toISOString(),
      results: rows,
      supervisor: this.supervisor.snapshot(),
      processes: this.processRegistry.list().map((pr) => ({
        id: pr.id,
        kind: pr.kind,
        label: pr.label,
        watchdog: pr.metadata?.watchdog === "true",
      })),
      privileges,
      userspace,
      openFailures: openFailures.slice(0, 30),
      bootstrap: await this.bootstrapPipeline.load().catch(() => null),
    };
    await this.environment.mkdir(dir);
    await this.environment.write(path, JSON.stringify(payload, null, 2));
    try {
      const { persistentLogger } = await import("../lib/persistent-logger");
      persistentLogger.add("info", "Health", `export ${path} rules=${rows.length}`);
    } catch { /* optional */ }
    return { path, count: rows.length };
  }
  async lastStartupFailure() {
    return this.startupTrace.lastFailure();
  }

  async listOpenFailures() {
    return this.failureJournal.openFailures();
  }

  async listRecentFailures(limit = 20) {
    const all = await this.failureJournal.list();
    return all.slice(0, limit);
  }

  /** Bind real Termux stage runner (called once from lib/runtime-facade). */
  bindBootstrapRunner(runner: import("./runtime/BootstrapPipeline").StageRunner): void {
    (this as { bootstrapPipeline: BootstrapPipeline }).bootstrapPipeline =
      createBootstrapPipeline(
        new EnvironmentTextStore(
          new AIBuilderTermuxEnvironment(this.home.root),
          `${this.home.metadata}/bootstrap-pipeline.json`,
        ),
        runner,
      );
  }

  async bootstrapState(): Promise<BootstrapPipelineState> {
    return this.bootstrapPipeline.load();
  }

  async bootstrapReset(): Promise<BootstrapPipelineState> {
    return this.bootstrapPipeline.reset();
  }

  async bootstrapRun(options?: {
    force?: boolean;
    onProgress?: (e: BootstrapProgressEvent) => void;
  }): Promise<BootstrapPipelineState> {
    return this.runMaintenance("bootstrap-pipeline", () =>
      this.bootstrapPipeline.run(options),
    );
  }

  async recordStartupStage(stage: import("./diagnostics/StartupTrace").StartupStage, status: "started" | "ok" | "warn" | "error", message?: string) {
    this.startupTrace.push(stage, status, message);
    if (status === "error") this.startupTrace.markFailed(stage, message || "error");
  }

  async repairHealth(id: string) {
    try {
      const { persistentLogger } = await import("../lib/persistent-logger");
      persistentLogger.add("info", "Health", `repair start id=${id}`);
    } catch { /* optional */ }
    if (id === "runtime.supervisor") {
      this.startSupervisor();
      try {
        const { persistentLogger } = await import("../lib/persistent-logger");
        persistentLogger.add("info", "Health", "repair supervisor → startSupervisor()");
      } catch { /* optional */ }
      return { id, ok: true, message: "Supervisor started", durationMs: 0 };
    }
    const base = await this.health.repair(id);
    // Best-effort: execute allowlisted DeterministicRepair recipe via Termux
    try {
      const { runRepairForDiagnostic } = await import("../lib/repair-script-runner");
      const shell = await runRepairForDiagnostic(id, { allowMedium: false });
      return { ...base, message: `${(base as { message?: string }).message || ""} | shell: ${shell.message}`.trim() };
    } catch {
      return base;
    }
  }

  /** Lazily loads the Termux-backed ADB bridge on Android; core tests stay platform-neutral. */
  createTermuxAdbDeviceBridge(): DeviceAgentBridge {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { TermuxAdbDeviceBridge } = require("./device/TermuxAdbDeviceBridge");
    return new TermuxAdbDeviceBridge();
  }

  async runDeviceAppLoop(options: DeviceAppLoopOptions): Promise<DeviceAppLoopResult> {
    return this.runRuntimeTask("device-app-loop", () => runDeviceAppLoop(this.device, options));
  }

  async runDeviceAutomation(options: DeviceAutomationOptions): Promise<DeviceAutomationResult> {
    return this.runRuntimeTask("device-automation", () => this.deviceAutomation.run(options));
  }

  async linuxStatus(profile: LinuxRuntimeProfile = "debian"): Promise<LinuxRuntimeStatus> {
    return this.linux.status(profile);
  }

  async linuxExec(command: string, args: readonly string[] = [], options?: { profile?: LinuxRuntimeProfile; cwd?: string; timeoutMs?: number }): Promise<LinuxExecResult> {
    return this.runRuntimeTask("linux-exec", () => this.linux.exec(command, args, options));
  }

  async linuxBootstrap(profile: LinuxRuntimeProfile = "debian"): Promise<LinuxExecResult> {
    return this.runMaintenance("linux-bootstrap", () => this.linux.bootstrap(profile));
  }

  async containerCreate(input: { imageId: string; name: string; projectId?: string }): Promise<import("./container/ContainerTypes").ContainerInstance> {
    return this.runRuntimeTask("container-create", () => {
      const projectId = input.projectId ? validateProjectName(input.projectId) : undefined;
      return this.containerRuntime.create({
        ...input,
        projectId,
        mounts: projectId ? [{ hostPath: `${this.home.projects}/${projectId}`, containerPath: "/workspace", mode: "rw" }] : [],
        policy: projectId ? "PROJECT_ONLY" : "PROJECT_AND_WORKSPACE",
      });
    });
  }

  async containerStart(instanceId: string): Promise<void> {
    return this.runRuntimeTask("container-start", () => this.containerRuntime.start(instanceId));
  }

  async containerStop(instanceId: string): Promise<void> {
    return this.runRuntimeTask("container-stop", () => this.containerRuntime.stop(instanceId));
  }

  async containerRemove(instanceId: string): Promise<void> {
    return this.runRuntimeTask("container-remove", () => this.containerRuntime.remove(instanceId));
  }

  async containerExec(instanceId: string, command: string, args: readonly string[] = [], options?: { cwd?: string; timeoutMs?: number }): Promise<ContainerExecResult> {
    return this.runRuntimeTask("container-exec", () => this.containerRuntime.exec(instanceId, command, args, options));
  }

  async containerInspect(instanceId: string) {
    return this.containerRuntime.inspect(instanceId);
  }

  async runAIWorkspaceBuild(containerId: string, plan: WorkspaceBuildPlan): Promise<WorkspaceBuildResult> {
    return this.runRuntimeTask("ai-workspace-build", () => this.workspaceBuilder.run(containerId, plan));
  }

  async generateAIProject(containerId: string, request: AIProjectRequest): Promise<AIProjectResult> {
    return this.runRuntimeTask("ai-project-generate", () => this.projectGenerator.generate(containerId, request));
  }

  async runAgenticBuildLoop(request: AgenticBuildLoopRequest): Promise<AgenticBuildLoopResult> {
    return this.runRuntimeTask("agentic-build-loop", () => runAgenticBuildLoop(this, request));
  }

  async runOneClickAppFactory(request: OneClickAppFactoryRequest): Promise<OneClickAppFactoryResult> {
    return this.runRuntimeTask("one-click-app-factory", () => this.oneClickAppFactory.run(request));
  }

  async runRealDeviceIntegration(request: RealDeviceIntegrationRequest = {}): Promise<RealDeviceIntegrationResult> {
    return this.runRuntimeTask("real-device-integration", () => runRealDeviceIntegration(this.device, request));
  }

  async persistentWorkspaceStatus(projectId: string): Promise<PersistentWorkspaceStatus> {
    return this.runRuntimeTask("workspace-status", () => this.persistentWorkspace.status(projectId));
  }

  async persistentWorkspaceDiff(projectId: string): Promise<string> {
    return this.runRuntimeTask("workspace-diff", () => this.persistentWorkspace.diff(projectId));
  }

  async persistentWorkspaceCheckpoint(projectId: string, message = "AI checkpoint"): Promise<WorkspaceGitEntry> {
    return this.runRuntimeTask("workspace-checkpoint", () => this.persistentWorkspace.checkpoint(projectId, message));
  }

  async persistentWorkspaceHistory(projectId: string, limit = 20): Promise<WorkspaceGitEntry[]> {
    return this.runRuntimeTask("workspace-history", () => this.persistentWorkspace.history(projectId, limit));
  }

  async persistentWorkspaceRestore(projectId: string, ref = "HEAD~1"): Promise<void> {
    return this.runRuntimeTask("workspace-restore", () => this.persistentWorkspace.restore(projectId, ref));
  }

  async persistentWorkspaceSnapshot(projectId: string, label = "snapshot"): Promise<PersistentWorkspaceSnapshot> {
    return this.runRuntimeTask("workspace-snapshot", () => this.persistentWorkspace.snapshot(projectId, label));
  }

  async persistentWorkspaceRestoreSnapshot(projectId: string, snapshotId: string): Promise<void> {
    return this.runRuntimeTask("workspace-restore-snapshot", () => this.persistentWorkspace.restoreSnapshot(projectId, snapshotId));
  }

  async projectMemoryGet(projectId: string): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-get", () => this.projectMemory.get(projectId));
  }

  async projectMemorySetArchitecture(projectId: string, architecture: string): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-architecture", () => this.projectMemory.setArchitecture(projectId, architecture));
  }

  async projectMemorySetDependencies(projectId: string, dependencies: readonly string[]): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-dependencies", () => this.projectMemory.setDependencies(projectId, dependencies));
  }

  async projectMemorySetConventions(projectId: string, conventions: readonly string[]): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-conventions", () => this.projectMemory.setConventions(projectId, conventions));
  }

  async projectMemoryRecordBuild(projectId: string, summary: string, detail = ""): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-build", () => this.projectMemory.recordBuild(projectId, summary, detail));
  }

  async projectMemoryRecordError(projectId: string, summary: string, detail = ""): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-error", () => this.projectMemory.recordError(projectId, summary, detail));
  }

  async projectMemoryRecordFix(projectId: string, summary: string, detail = ""): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-fix", () => this.projectMemory.recordFix(projectId, summary, detail));
  }

  async projectMemoryRecordTest(projectId: string, summary: string, detail = ""): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-test", () => this.projectMemory.recordTest(projectId, summary, detail));
  }

  async projectMemoryContext(projectId: string): Promise<string> {
    return this.runRuntimeTask("project-memory-context", () => this.projectMemory.context(projectId));
  }

  async projectMemoryReset(projectId: string): Promise<AIProjectMemory> {
    return this.runRuntimeTask("project-memory-reset", () => this.projectMemory.reset(projectId));
  }

  async runAICodingAgent(containerId: string, request: AICodingAgentRequest): Promise<AICodingAgentResult> {
    return this.runRuntimeTask("ai-coding-agent", async () => {
      const memory = await this.projectMemory.context(request.name);
      const enriched = { ...request, memoryContext: request.memoryContext ?? memory };
      const result = request.planner
        ? await this.codingAgent.run(containerId, enriched)
        : !this.codingBrain.isReady()
          ? await this.codingAgent.run(containerId, enriched)
          : await this.codingAgent.run(containerId, { ...enriched, planner: (ctx) => this.codingBrain.plan(ctx, containerId) });
      await this.projectMemory.recordBuild(request.name, result.ok ? "Coding/build cycle succeeded" : "Coding/build cycle failed", result.error || `${result.iterations.length} iterations`);
      if (result.ok) await this.projectMemory.recordFix(request.name, "Successful coding/build cycle", result.changedFiles.join(", "));
      else await this.projectMemory.recordError(request.name, result.error || "Unknown coding/build failure");
      return result;
    });
  }

  async generateDeviceTestSuite(goal: string, packageName?: string, model?: TestPlanModel): Promise<DeviceTestSuite> {
    return generateDeviceTestSuite(goal, packageName, model);
  }

  async runDeviceTestSuite(options: { apkPath: string; packageName?: string; goal: string; projectPath: string; runId?: string; model?: TestPlanModel; maxActionsPerCase?: number }): Promise<DeviceTestSuiteRun> {
    return this.runRuntimeTask("device-test-suite", async () => {
      const suite = await generateDeviceTestSuite(options.goal, options.packageName, options.model);
      const evidence = new DeviceEvidenceStore(options.projectPath, options.runId || `run-${Date.now()}`);
      return runDeviceTestSuite(this.device, { apkPath: options.apkPath, packageName: options.packageName, suite, evidence, maxActionsPerCase: options.maxActionsPerCase });
    });
  }

  /** Execute device automation through the policy-gated AgentManager path. */
  async runDeviceAutomationAsAgent(
    projectId: string,
    options: DeviceAutomationOptions,
  ): Promise<DeviceAutomationResult> {
    const agent = this.createAgentForProject(projectId);
    try {
      const result = await this.agents.execute(agent.id, {
        tool: "device.automation_loop",
        capability: "adb",
        args: options as unknown as Record<string, unknown>,
      });
      if (!result.ok) throw new Error(result.error || "DEVICE_AUTOMATION_AGENT_FAILED");
      const parsed = JSON.parse(result.output || "{}");
      return parsed as DeviceAutomationResult;
    } finally {
      this.processRegistry.unregister(`agent-${agent.id}`);
      this.agents.remove(agent.id);
    }
  }

  useDeviceBridge(bridge: DeviceAgentBridge): void {
    this.device = bridge;
    this.deviceTools = new DeviceAgentTools(bridge);
    this.deviceAutomation = new DeviceAutomationAgent(bridge);
  }

  private registerDefaultRecoveryActions(): void {
    this.recovery.register({
      id: "recreate_session",
      kind: "recreate_session",
      description: "Close and recreate builder session",
      run: () => {
        this.sessions.closeAll();
      },
    });
    this.recovery.register({
      id: "clear_process_registry",
      kind: "other",
      description: "Clear registered processes",
      run: () => {
        this.processRegistry.clear();
      },
    });
    this.recovery.register({
      id: "stop_all_containers",
      kind: "container_restart",
      description: "Stop all container instances (projects kept)",
      run: async () => {
        const list = this.containers.listInstances();
        for (const inst of list) {
          try {
            await this.containers.stop(inst.id);
          } catch {
            // ignore
          }
          this.processRegistry.unregister(`container-${inst.id}`);
        }
      },
    });
    this.recovery.register({
      id: "close_all_terminals",
      kind: "restart_terminal",
      description: "Close all terminal sessions",
      run: async () => {
        if (this.terminals) await this.terminals.closeAll();
      },
    });
    this.recovery.register({
      id: "refresh_toolchains",
      kind: "other",
      description: "Refresh toolchain discovery",
      run: async () => {
        await this.refreshToolchains();
      },
    });
    this.recovery.register({
      id: "refresh_privileges",
      kind: "other",
      description: "Re-detect Shizuku/Root/ADB capabilities",
      run: async () => {
        await this.refreshPrivileges();
      },
    });
    this.recovery.register({
      id: "destroy_all_containers",
      kind: "container_restart",
      description: "Destroy all container instances (projects kept)",
      run: async () => {
        const list = this.containers.listInstances();
        for (const inst of list) {
          try {
            await this.containers.remove(inst.id);
          } catch {
            // ignore
          }
          this.processRegistry.unregister(`container-${inst.id}`);
        }
      },
    });
  }

  async refreshPrivileges(): Promise<CapabilityDetection> {
    try {
      this.privilegeSnapshot = await detectDevicePrivileges();
    } catch {
      this.privilegeSnapshot = await detectPrivileges({
        none: this.privileges.none,
        shizuku: this.privileges.shizuku,
        root: this.privileges.root,
      });
    }
    // Rebind providers to live detection (plan P2 Shizuku bridge health)
    const snap = this.privilegeSnapshot;
    (this.privileges as { shizuku: PrivilegeProvider }).shizuku = new ShizukuProvider(
      !!snap.shizuku,
      snap.shizuku
        ? async (command: string) => {
            const { shizukuExec } = await import("../lib/shizuku-bridge");
            const r = await shizukuExec(command, { timeoutMs: 30_000 });
            return { exitCode: r.exitCode, code: r.exitCode, stdout: r.stdout, stderr: r.stderr };
          }
        : undefined,
    );
    (this.privileges as { root: PrivilegeProvider }).root = new RootProvider(!!snap.root);
    return this.privilegeSnapshot;
  }

  getPrivileges(): CapabilityDetection | null {
    return this.privilegeSnapshot;
  }

  async diagnostics(): Promise<DiagnosticReport> {
    const priv = this.privilegeSnapshot ?? (await this.refreshPrivileges());
    const tc = this.toolchains.diagnostics();
    return buildDiagnosticReport([
      {
        area: "home",
        level: "ok",
        message: "AIBuilderTermux HOME",
        details: { path: this.home.root },
      },
      {
        area: "toolchains",
        level: tc.available > 0 ? "ok" : "warn",
        message: `toolchains available=${tc.available}`,
      },
      {
        area: "containers",
        level: "ok",
        message: `images=${this.containers.listImages().length}`,
      },
      {
        area: "privilege",
        level: priv.active === "none" ? "info" : "ok",
        message: `active=${priv.active}`,
        details: {
          shizuku: priv.shizuku,
          root: priv.root,
        },
      },
      {
        area: "native",
        level: this.native.detect().available ? "ok" : "info",
        message: this.native.detect().reason ?? "native optional",
      },
    ]);
  }

  finalValidation(): FinalValidationReport {
    return runFinalValidation({
      homeLayout: this.home,
      executionEnvironment: this.environment,
      projectManager: true,
      terminalSessionManager: this.terminals ?? true,
      toolchainManager: this.toolchains,
      processRegistry: this.processRegistry,
      sessionManager: this.sessions,
      containerManager: this.containers,
      agentManager: this.agents,
      androidBridge: this.bridge,
      privilegeNone: this.privileges.none,
      nativeRuntime: this.native,
    });
  }

  /** Open a builder session bound to a project under HOME/projects. */
  openProjectSession(projectId: string): ReturnType<SessionManager["create"]> {
    const projectRoot = `${this.home.projects}/${projectId}`;
    const session = this.sessions.create({
      projectId,
      projectRoot,
      environmentId: "termux",
      metadata: { home: this.home.root },
    });
    this.processRegistry.register({
      id: `session-proc-${session.id}`,
      kind: "runtime",
      sessionId: session.id,
      projectId,
      startedAt: Date.now(),
      label: `session:${projectId}`,
      metadata: { watchdog: "true" },
    });
    return session;
  }

  /**
   * Launch Ubuntu userspace instance for a project.
   * Mounts project at /workspace; never deletes the project on destroy.
   */
  async launchUbuntu(projectId: string, name?: string) {
    return this.runRuntimeTask(`launch-ubuntu:${projectId}`, async () => {
    const { launchUbuntuForProject } = await import("./ubuntu/UbuntuLifecycle");
    const { buildUbuntuShellSpec, describeUbuntuShell } = await import(
      "./ubuntu/UbuntuShell"
    );
    const projectRoot = `${this.home.projects}/${projectId}`;
    const result = await launchUbuntuForProject(this.containers, this.home, {
      projectId,
      projectRoot,
      name,
    });
    const shell = buildUbuntuShellSpec(this.home, {
      instanceId: result.instance.id,
      projectId,
      projectRoot,
    });
    this.processRegistry.register({
      id: `container-${result.instance.id}`,
      kind: "container",
      projectId,
      startedAt: Date.now(),
      label: result.instance.name,
      metadata: {
        imageId: result.instance.imageId,
        shell: describeUbuntuShell(shell),
        watchdog: "true",
      },
    });
    return { ...result, shell };
    });
  }

  async launchKali(projectId: string, name?: string) {
    return this.runRuntimeTask(`launch-kali:${projectId}`, async () => {
    const { launchKaliForProject } = await import("./container/KaliLifecycle");
    const { buildKaliShellSpec, describeKaliShell } = await import(
      "./container/KaliShell"
    );
    const projectRoot = `${this.home.projects}/${projectId}`;
    const instance = await launchKaliForProject(this.containers, this.home, {
      projectId,
      projectRoot,
      name,
    });
    const shell = buildKaliShellSpec(this.home, {
      instanceId: instance.id,
      projectId,
      projectRoot,
    });
    this.processRegistry.register({
      id: `container-${instance.id}`,
      kind: "container",
      projectId,
      startedAt: Date.now(),
      label: instance.name,
      metadata: {
        imageId: instance.imageId,
        shell: describeKaliShell(shell),
        watchdog: "true",
      },
    });
    return { instance, shell };
    });
  }

  async stopContainer(instanceId: string): Promise<void> {
    await this.runRuntimeTask(`stop-container:${instanceId}`, async () => { await this.containers.stop(instanceId); this.processRegistry.unregister(`container-${instanceId}`); });
  }

  /** Create an agent bound to a project with terminal capability enabled. */
  createAgentForProject(projectId: string) {
    const agent = this.agents.create({
      projectId,
      policy: {
        allowedCapabilities: ["filesystem", "terminal", "adb"],
        projectIsolation: true,
        homeIsolation: true,
      },
    });
    this.processRegistry.register({
      id: `agent-${agent.id}`,
      kind: "agent",
      projectId,
      startedAt: Date.now(),
      label: `agent:${projectId}`,
      metadata: { watchdog: "true" },
    });
    return agent;
  }

  /**
   * Open a Termux-backed terminal session for a project (PWD=project, HOME=AIBuilderTermux).
   */
  async openTerminalForProject(projectId: string) {
    if (!this.terminals) {
      throw new Error("Terminal session manager unavailable");
    }
    const projectRoot = `${this.home.projects}/${projectId}`;
    const session = await this.terminals.create({
      cwd: projectRoot,
      home: this.home.root,
      projectRoot,
      env: {
        HOME: this.home.root,
        AI_BUILDER_HOME: this.home.root,
        PWD: projectRoot,
        PROJECT_ROOT: projectRoot,
        AI_BUILDER_PROJECT: projectRoot,
      },
    });
    this.processRegistry.register({
      id: `terminal-${session.id}`,
      kind: "terminal",
      sessionId: session.id,
      projectId,
      startedAt: Date.now(),
      label: `terminal:${projectId}`,
      metadata: { watchdog: "true" },
    });
    return session;
  }

  /**
   * Build proot launch plan for a running container instance (no execution).
   */
  buildProotPlanForInstance(
    profile: "ubuntu" | "kali",
    instanceId: string,
    projectId: string,
    rootfsPath?: string,
  ) {
    const projectRoot = `${this.home.projects}/${projectId}`;
    const spec = buildContainerShellSpec(this.home, profile, {
      instanceId,
      projectId,
      projectRoot,
    });
    return buildProotLaunchPlan(spec, { rootfsPath });
  }

  /**
   * Execute proot plan via ExecutionEnvironment (Termux).
   * If rootfs is missing, runs diagnostic echo only.
   */
  async runProotPlanForInstance(
    profile: "ubuntu" | "kali",
    instanceId: string,
    projectId: string,
    rootfsPath?: string,
  ) {
    const plan = this.buildProotPlanForInstance(
      profile,
      instanceId,
      projectId,
      rootfsPath,
    );
    const result = await this.environment.exec(plan.command, {
      cwd: this.home.root,
      env: plan.env,
    });
    return { plan, result };
  }


  getRootfsManifest(profile: "ubuntu" | "kali") {
    return buildRootfsImageManifest(this.home, profile);
  }

  async markRootfsReady(profile: "ubuntu" | "kali") {
    const manifest = buildRootfsImageManifest(this.home, profile);
    await this.environment.mkdir(manifest.rootfsPath);
    await this.environment.write(manifest.readyMarker, `ready:${Date.now()}\n`);
    return manifest;
  }

  async isRootfsReady(profile: "ubuntu" | "kali") {
    const manifest = buildRootfsImageManifest(this.home, profile);
    return isRootfsReady(manifest, (path) => this.environment.exists(path));
  }

  async ensureRootfs(profile: "ubuntu" | "kali") {
    return ensureRootfsLayout(
      this.home,
      profile,
      (path) => this.environment.mkdir(path),
      (path) => this.environment.exists(path),
    );
  }

  async discoverContainerRootfs(profile: "ubuntu" | "kali") {
    return discoverRootfsPath(this.home, profile, (path) =>
      this.environment.exists(path),
    );
  }

  /** Run proot plan, auto-discovering rootfs under HOME when not provided. */
  async runProotAuto(
    profile: "ubuntu" | "kali",
    instanceId: string,
    projectId: string,
  ) {
    const rootfsPath =
      (await this.discoverContainerRootfs(profile)) ?? undefined;
    return this.runProotPlanForInstance(
      profile,
      instanceId,
      projectId,
      rootfsPath,
    );
  }

  async refreshToolchains() {
    this.registerDefaultToolchainSources();
    return this.toolchains.refresh();
  }

  /** Register default read-only HOME toolchain dir probe (no installs). */
  registerDefaultToolchainSources(): void {
    const root = this.home.toolchains;
    this.toolchains.registerSource({
      discover: async () => {
        const { discoverHomeToolchainDirs } = await import(
          "./toolchain/ToolDiscovery"
        );
        return discoverHomeToolchainDirs(
          {
            exists: async (p: string) => {
              try {
                return await this.environment.exists(p);
              } catch {
                return false;
              }
            },
          },
          root,
        );
      },
    });
  }
}

export function createRuntimeFacade(
  options?: RuntimeFacadeOptions,
): RuntimeFacade {
  return new RuntimeFacade(options);
}
