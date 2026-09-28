/**
 * Runtime-only agent models and policy.
 */

export type AgentCapability =
  | "filesystem"
  | "network"
  | "adb"
  | "bridge"
  | "privilege"
  | "terminal"
  | "container";

export type AgentPolicy = {
  readonly allowedCapabilities: readonly AgentCapability[];
  readonly projectIsolation: boolean;
  readonly homeIsolation: boolean;
  readonly maxConcurrentTools?: number;
};

export const DEFAULT_AGENT_POLICY: AgentPolicy = {
  allowedCapabilities: ["filesystem"],
  projectIsolation: true,
  homeIsolation: true,
  maxConcurrentTools: 4,
};

export type AgentSession = {
  readonly id: string;
  readonly sessionId?: string;
  readonly projectId?: string;
  readonly policy: AgentPolicy;
  readonly createdAt: number;
  status: "idle" | "running" | "stopped" | "error";
};

export type AgentExecRequest = {
  readonly tool: string;
  readonly args?: Readonly<Record<string, unknown>>;
  readonly capability: AgentCapability;
};

export type AgentExecResult = {
  readonly ok: boolean;
  readonly output?: string;
  readonly error?: string;
  readonly durationMs: number;
};
