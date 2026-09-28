import { githubPullRequestFiles } from "../../github-tools";
import type { ToolArgs } from "../types";
export function validate(args: ToolArgs): string | null {
  if(!String(args.owner||"").trim()||!String(args.repo||"").trim()) return "GITHUB_REPO_REQUIRED";
  return Number.isInteger(Number(args.number))&&Number(args.number)>=1?null:"GITHUB_PR_NUMBER_REQUIRED";
}
export function execute(args: ToolArgs) { return githubPullRequestFiles(String(args.owner),String(args.repo),Number(args.number),typeof args.token==="string"?args.token:undefined); }
