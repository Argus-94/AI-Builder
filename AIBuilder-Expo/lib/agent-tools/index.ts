import * as buildRun from "./build-run";
import * as toolchainEnsure from "./toolchain-ensure";
import * as fsRead from "./fs/read";
import * as fsHashline from "./fs/hashline";
import * as fsCreate from "./fs/create";
import * as fsDelete from "./fs/delete";
import * as fsReplace from "./fs/replace";
import * as fsReplaceRange from "./fs/replace-range";
import * as astSearch from "./ast/search";
import * as astPreview from "./ast/preview";
import * as astEdit from "./ast/edit";
import * as lspDiagnostics from "./lsp/diagnostics";
import * as lspRequest from "./lsp/request";
import * as lspDefinition from "./lsp/definition";
import * as lspReferences from "./lsp/references";
import * as lspHover from "./lsp/hover";
import * as lspCompletion from "./lsp/completion";
import * as lspRename from "./lsp/rename";
import * as githubRead from "./github/read";
import * as githubTree from "./github/tree";
import * as githubList from "./github/list";
import * as githubDiff from "./github/diff";
import * as githubPrFiles from "./github/pr-files";
import * as githubSearch from "./github/search";
import * as githubSearchIssues from "./github/search-issues";
import * as skillsList from "./skills/list";
import * as skillsRead from "./skills/read";
import * as skillsVerify from "./skills/verify";
import * as memoryRecall from "./memory/recall";
import * as memoryRetain from "./memory/retain";
import * as memoryReflect from "./memory/reflect";
import * as runtimeStatus from "./runtime/status";
import * as runtimeSession from "./runtime/session";
import * as runtimeTerminal from "./runtime/terminal";
import * as runtimeProot from "./runtime/proot";
import * as ctxCompose from "./ctx/compose";
import * as ctxExpand from "./ctx/expand";
import * as ctxMetrics from "./ctx/metrics";
import { AGENT_TOOL_NAMES, type AgentToolCall, type AgentToolName, type ToolArgs, type ToolDefinition } from "./types";
import { isArgsObject } from "./common";

const DEFINITIONS: Record<AgentToolName, ToolDefinition> = {
  "build.run": { validate: buildRun.validate, execute: buildRun.execute },
  "toolchain.ensure": { validate: toolchainEnsure.validate, execute: toolchainEnsure.execute },
  "fs.read": { validate: fsRead.validate, execute: fsRead.execute },
  "fs.hashline": { validate: fsHashline.validate, execute: fsHashline.execute },
  "fs.create": { validate: fsCreate.validate, execute: fsCreate.execute },
  "fs.delete": { validate: fsDelete.validate, execute: fsDelete.execute },
  "fs.replace": { validate: fsReplace.validate, execute: fsReplace.execute },
  "fs.replaceRange": { validate: fsReplaceRange.validate, execute: fsReplaceRange.execute },
  "ast.search": { validate: astSearch.validate, execute: astSearch.execute },
  "ast.preview": { validate: astPreview.validate, execute: astPreview.execute },
  "ast.edit": { validate: astEdit.validate, execute: astEdit.execute },
  "lsp.diagnostics": { validate: lspDiagnostics.validate, execute: lspDiagnostics.execute },
  "lsp.request": { validate: lspRequest.validate, execute: lspRequest.execute },
  "lsp.definition": { validate: lspDefinition.validate, execute: lspDefinition.execute },
  "lsp.references": { validate: lspReferences.validate, execute: lspReferences.execute },
  "lsp.hover": { validate: lspHover.validate, execute: lspHover.execute },
  "lsp.completion": { validate: lspCompletion.validate, execute: lspCompletion.execute },
  "lsp.rename": { validate: lspRename.validate, execute: lspRename.execute },
  "github.read": { validate: githubRead.validate, execute: githubRead.execute },
  "github.tree": { validate: githubTree.validate, execute: githubTree.execute },
  "github.list": { validate: githubList.validate, execute: githubList.execute },
  "github.diff": { validate: githubDiff.validate, execute: githubDiff.execute },
  "github.prFiles": { validate: githubPrFiles.validate, execute: githubPrFiles.execute },
  "github.search": { validate: githubSearch.validate, execute: githubSearch.execute },
  "github.searchIssues": { validate: githubSearchIssues.validate, execute: githubSearchIssues.execute },
  "skills.list": { validate: skillsList.validate, execute: skillsList.execute },
  "skills.read": { validate: skillsRead.validate, execute: skillsRead.execute },
  "skills.verify": { validate: skillsVerify.validate, execute: skillsVerify.execute },
  "memory.recall": { validate: memoryRecall.validate, execute: memoryRecall.execute },
  "memory.retain": { validate: memoryRetain.validate, execute: memoryRetain.execute },
  "memory.reflect": { validate: memoryReflect.validate, execute: memoryReflect.execute },
  "runtime.status": { validate: runtimeStatus.validate, execute: runtimeStatus.execute },
  "runtime.session": { validate: runtimeSession.validate, execute: runtimeSession.execute },
  "runtime.terminal": { validate: runtimeTerminal.validate, execute: runtimeTerminal.execute },
  "runtime.proot": { validate: runtimeProot.validate, execute: runtimeProot.execute },
  "ctx.compose": { validate: ctxCompose.validate, execute: ctxCompose.execute },
  "ctx.expand": { validate: ctxExpand.validate, execute: ctxExpand.execute },
  "ctx.metrics": { validate: ctxMetrics.validate, execute: ctxMetrics.execute },
};

export function validateAgentToolCall(spec: unknown): { ok: true } | { ok: false; error: string } {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { ok: false, error: "TOOL_CALL_OBJECT_REQUIRED" };
  }
  const call = spec as AgentToolCall;
  if (typeof call.tool !== "string" || !call.tool.trim()) {
    return { ok: false, error: "TOOL_NAME_REQUIRED" };
  }
  if (!Object.prototype.hasOwnProperty.call(DEFINITIONS, call.tool)) {
    return { ok: false, error: `UNKNOWN_AGENT_TOOL:${call.tool}` };
  }
  if (call.args !== undefined && !isArgsObject(call.args)) {
    return { ok: false, error: "TOOL_ARGS_OBJECT_REQUIRED" };
  }
  const args = call.args || {};
  if (Object.prototype.hasOwnProperty.call(args, "allowDangerous")) {
    return { ok: false, error: "ALLOW_DANGEROUS_NOT_ALLOWED" };
  }
  const error = DEFINITIONS[call.tool as AgentToolName].validate(args);
  return error ? { ok: false, error } : { ok: true };
}

export async function executeAgentTool(name: AgentToolName, args: ToolArgs, projectPath?: string | null) {
  const definition = DEFINITIONS[name];
  if (!definition) throw new Error(`UNKNOWN_AGENT_TOOL:${name}`);
  return definition.execute(args, projectPath);
}

export { AGENT_TOOL_NAMES };
export type { AgentToolCall, AgentToolName, ToolArgs } from "./types";
