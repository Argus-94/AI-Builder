/**
 * Runtime-only AgentManager / Executor.
 * Agent runs through ExecutionEnvironment; capabilities are policy-gated.
 */

import type { ExecutionEnvironment } from "../environment/ExecutionEnvironment";
import type { DeviceAutomationAgent, DeviceAutomationOptions, DeviceAutomationResult } from "../device/DeviceAutomationAgent";
import {
  DEFAULT_AGENT_POLICY,
  type AgentExecRequest,
  type AgentExecResult,
  type AgentPolicy,
  type AgentSession,
} from "./AgentTypes";

/** Optional host hooks so agent can open terminals / run shell without tight coupling. */
export type AgentHostHooks = {
  openTerminalForProject?: (projectId: string) => Promise<{ id: string }>;
  runShell?: (
    command: string,
    options?: { cwd?: string; env?: Record<string, string> },
  ) => Promise<{ exitCode?: number | null; stdout?: string; stderr?: string }>;
  runDeviceAutomation?: (options: DeviceAutomationOptions) => Promise<DeviceAutomationResult>;
};

export class AgentManager {
  private readonly agents = new Map<string, AgentSession>();
  private host: AgentHostHooks = {};

  constructor(private readonly environment: ExecutionEnvironment) {}

  setHostHooks(hooks: AgentHostHooks): void {
    this.host = { ...this.host, ...hooks };
  }

  create(input?: {
    id?: string;
    sessionId?: string;
    projectId?: string;
    policy?: Partial<AgentPolicy>;
  }): AgentSession {
    const id = input?.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    if (this.agents.has(id)) {
      throw new Error(`Agent already exists: ${id}`);
    }
    const policy: AgentPolicy = {
      ...DEFAULT_AGENT_POLICY,
      ...input?.policy,
      allowedCapabilities:
        input?.policy?.allowedCapabilities ?? DEFAULT_AGENT_POLICY.allowedCapabilities,
    };
    const session: AgentSession = {
      id,
      sessionId: input?.sessionId,
      projectId: input?.projectId,
      policy,
      createdAt: Date.now(),
      status: "idle",
    };
    this.agents.set(id, session);
    return session;
  }

  get(id: string): AgentSession | undefined {
    return this.agents.get(id);
  }

  list(): AgentSession[] {
    return [...this.agents.values()];
  }

  async execute(agentId: string, request: AgentExecRequest): Promise<AgentExecResult> {
    const agent = this.agents.get(agentId);
    const started = Date.now();
    if (!agent) {
      return { ok: false, error: `Unknown agent: ${agentId}`, durationMs: 0 };
    }
    if (!agent.policy.allowedCapabilities.includes(request.capability)) {
      return {
        ok: false,
        error: `Capability denied: ${request.capability}`,
        durationMs: Date.now() - started,
      };
    }
    agent.status = "running";
    try {
      const home = String(await Promise.resolve(this.environment.getHome()));

      if (request.tool === "env.home") {
        agent.status = "idle";
        return { ok: true, output: home, durationMs: Date.now() - started };
      }

      if (request.tool === "fs.exists" && typeof request.args?.path === "string") {
        const path = String(request.args.path);
        if (agent.policy.homeIsolation && !path.startsWith(home)) {
          agent.status = "idle";
          return {
            ok: false,
            error: "HOME isolation: path outside AI_BUILDER_HOME",
            durationMs: Date.now() - started,
          };
        }
        const exists = await this.environment.exists(path);
        agent.status = "idle";
        return {
          ok: true,
          output: exists ? "true" : "false",
          durationMs: Date.now() - started,
        };
      }

      if (request.tool === "fs.mkdir" && typeof request.args?.path === "string") {
        const path = String(request.args.path);
        if (agent.policy.homeIsolation && !path.startsWith(home)) {
          agent.status = "idle";
          return {
            ok: false,
            error: "HOME isolation: path outside AI_BUILDER_HOME",
            durationMs: Date.now() - started,
          };
        }
        await this.environment.mkdir(path);
        agent.status = "idle";
        return { ok: true, output: path, durationMs: Date.now() - started };
      }

      if (request.tool === "fs.read" && typeof request.args?.path === "string") {
        const path = String(request.args.path);
        if (agent.policy.homeIsolation && !path.startsWith(home)) {
          agent.status = "idle";
          return {
            ok: false,
            error: "HOME isolation: path outside AI_BUILDER_HOME",
            durationMs: Date.now() - started,
          };
        }
        const content = await this.environment.read(path);
        agent.status = "idle";
        return { ok: true, output: content, durationMs: Date.now() - started };
      }

      if (request.tool === "terminal.open") {
        if (!agent.policy.allowedCapabilities.includes("terminal")) {
          agent.status = "idle";
          return {
            ok: false,
            error: "Capability denied: terminal",
            durationMs: Date.now() - started,
          };
        }
        const projectId =
          (typeof request.args?.projectId === "string"
            ? request.args.projectId
            : agent.projectId) ?? "default";
        if (!this.host.openTerminalForProject) {
          agent.status = "idle";
          return {
            ok: false,
            error: "terminal host not configured",
            durationMs: Date.now() - started,
          };
        }
        const term = await this.host.openTerminalForProject(projectId);
        agent.status = "idle";
        return {
          ok: true,
          output: term.id,
          durationMs: Date.now() - started,
        };
      }

      if (request.tool === "device.automation_loop") {
        if (!agent.policy.allowedCapabilities.includes("adb")) {
          agent.status = "idle";
          return { ok: false, error: "Capability denied: adb", durationMs: Date.now() - started };
        }
        if (!this.host.runDeviceAutomation) {
          agent.status = "idle";
          return { ok: false, error: "device automation host not configured", durationMs: Date.now() - started };
        }
        const apkPath = typeof request.args?.apkPath === "string" ? request.args.apkPath : "";
        const packageName = typeof request.args?.packageName === "string" ? request.args.packageName : undefined;
        const goal = typeof request.args?.goal === "string" ? request.args.goal : "";
        const vision = request.args?.vision;
        if (!apkPath || !goal || typeof vision !== "function") {
          agent.status = "idle";
          return { ok: false, error: "INVALID_DEVICE_AUTOMATION_ARGUMENTS", durationMs: Date.now() - started };
        }
        const result = await this.host.runDeviceAutomation({
          apkPath, packageName, goal,
          maxSteps: typeof request.args?.maxSteps === "number" ? request.args.maxSteps : undefined,
          settleMs: typeof request.args?.settleMs === "number" ? request.args.settleMs : undefined,
          screenshotPath: typeof request.args?.screenshotPath === "string" ? request.args.screenshotPath : undefined,
          vision: vision as DeviceAutomationOptions["vision"],
        });
        agent.status = "idle";
        return { ok: result.ok, output: JSON.stringify(result), durationMs: Date.now() - started };
      }

      if (request.tool === "shell.exec" && typeof request.args?.command === "string") {
        if (!agent.policy.allowedCapabilities.includes("terminal")) {
          agent.status = "idle";
          return {
            ok: false,
            error: "Capability denied: terminal",
            durationMs: Date.now() - started,
          };
        }
        const command = String(request.args.command);
        const cwd =
          typeof request.args.cwd === "string" ? String(request.args.cwd) : undefined;
        if (cwd && agent.policy.homeIsolation && !cwd.startsWith(home)) {
          agent.status = "idle";
          return {
            ok: false,
            error: "HOME isolation: cwd outside AI_BUILDER_HOME",
            durationMs: Date.now() - started,
          };
        }
        if (this.host.runShell) {
          const result = await this.host.runShell(command, { cwd });
          agent.status = "idle";
          return {
            ok: (result.exitCode ?? 0) === 0,
            output: result.stdout ?? "",
            error: result.stderr,
            durationMs: Date.now() - started,
          };
        }
        const result = await this.environment.exec(command, { cwd });
        const exitCode =
          result && typeof result === "object" && "exitCode" in result
            ? Number((result as { exitCode: number }).exitCode)
            : 0;
        const stdout =
          result && typeof result === "object" && "stdout" in result
            ? String((result as { stdout: string }).stdout)
            : "";
        agent.status = "idle";
        return {
          ok: exitCode === 0,
          output: stdout,
          durationMs: Date.now() - started,
        };
      }

      agent.status = "idle";
      return {
        ok: false,
        error: `Unsupported tool in skeleton: ${request.tool}`,
        durationMs: Date.now() - started,
      };
    } catch (e) {
      agent.status = "error";
      return {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - started,
      };
    }
  }

  stop(agentId: string): void {
    const agent = this.agents.get(agentId);
    if (agent) agent.status = "stopped";
  }

  remove(agentId: string): boolean {
    return this.agents.delete(agentId);
  }
}

export function createAgentManager(env: ExecutionEnvironment): AgentManager {
  return new AgentManager(env);
}
