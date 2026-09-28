import { githubReadUri } from "../../github-tools";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null { return /^(?:github:\/\/|https:\/\/github\.com\/)/i.test(String(args.uri||"")) ? null : "GITHUB_URI_REQUIRED"; }
export function execute(args: ToolArgs) { return githubReadUri(String(args.uri),typeof args.token==="string"?args.token:undefined); }
