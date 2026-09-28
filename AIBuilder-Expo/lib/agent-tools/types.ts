export interface AgentToolCall {
  tool: string;
  args?: Record<string, unknown>;
}

export const AGENT_TOOL_NAMES = [
  "build.run",
  "toolchain.ensure",
  "fs.read",
  "fs.hashline",
  "fs.create",
  "fs.delete",
  "fs.replace",
  "fs.replaceRange",
  "ast.search",
  "ast.preview",
  "ast.edit",
  "lsp.diagnostics",
  "lsp.request",
  "lsp.definition",
  "lsp.references",
  "lsp.hover",
  "lsp.completion",
  "lsp.rename",
  "github.read",
  "github.tree",
  "github.list",
  "github.diff",
  "github.prFiles",
  "github.search",
  "github.searchIssues",
  "skills.list",
  "skills.read",
  "skills.verify",
  "memory.recall",
  "memory.retain",
  "memory.reflect",
  "runtime.status",
  "runtime.session",
  "runtime.terminal",
  "runtime.proot",
  "ctx.compose",
  "ctx.expand",
  "ctx.metrics",
] as const;

export type AgentToolName = typeof AGENT_TOOL_NAMES[number];
export type ToolArgs = Record<string, unknown>;
export type ToolResult = unknown;
export type ToolValidator = (args: ToolArgs) => string | null;
export type ToolExecutor = (
  args: ToolArgs,
  projectPath?: string | null,
) => Promise<ToolResult>;
export type ToolDefinition = {
  validate: ToolValidator;
  execute: ToolExecutor;
};
