import { executeGuardedTermuxCommand } from "./termux-executor";

function esc(s:string){return s.replace(/\'/g, "'\\''");}
export function githubRawUrl(owner:string,repo:string,path:string,ref="HEAD"){return `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${encodeURIComponent(ref)}/${path.split("/").filter(Boolean).map(encodeURIComponent).join("/")}`;}
export async function githubFetch(url:string){if(!/^https:\/\/(?:github\.com|raw\.githubusercontent\.com)\//i.test(url)) throw new Error("Only GitHub URLs are allowed"); return executeGuardedTermuxCommand(`curl -L --fail --max-time 30 '${esc(url)}'`,{timeoutMs:45000});}
export async function githubApi(path:string,token?:string){if(!/^\/?(?:repos|search|users)\//.test(path)) throw new Error("Only GitHub API resource paths are allowed"); const url=`https://api.github.com/${path.replace(/^\//,"")}`; const auth=token?.trim()?` -H 'Authorization: Bearer ${esc(token)}'`:""; return executeGuardedTermuxCommand(`curl -L --fail --max-time 30 -H 'Accept: application/vnd.github+json'${auth} '${esc(url)}'`,{timeoutMs:45000});}
export async function githubRepoContents(owner:string,repo:string,path="",ref="HEAD",token?:string){const clean=path.split("/").filter(Boolean).map(encodeURIComponent).join("/"); const suffix=clean?`/${clean}`:""; return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${suffix}?ref=${encodeURIComponent(ref)}`,token);}
export async function githubIssueOrPr(owner:string,repo:string,number:number,token?:string){return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues/${number}`,token);}
export async function githubPullRequest(owner:string,repo:string,number:number,token?:string){return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}`,token);}
export async function githubSearchCode(q:string,token?:string){return githubApi(`search/code?q=${encodeURIComponent(q)}`,token);}

/**
 * Normalize the two supported github.read contracts into the internal filesystem-shaped URI:
 * - github://owner/repo/path@ref
 * - https://github.com/owner/repo/blob/ref/path
 * - https://github.com/owner/repo/tree/ref/path
 * - https://github.com/owner/repo/pull/123
 * - https://github.com/owner/repo/issues/123
 */
export function normalizeGithubReadUri(uri:string){
  const value=String(uri||"").trim();
  if(/^github:\/\//i.test(value)) return value;
  if(!/^https:\/\/github\.com\//i.test(value)) throw new Error("Invalid GitHub read URI");
  let u:URL;
  try { u=new URL(value); } catch { throw new Error("Invalid GitHub URL"); }
  if(u.protocol!=="https:" || u.hostname.toLowerCase()!=="github.com") throw new Error("Only https://github.com URLs are allowed");
  if(u.search || u.hash) throw new Error("GitHub URL query/hash is not allowed");
  const parts=u.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if(parts.length<2) throw new Error("GitHub repository is required");
  const [owner,repo,...rest]=parts;
  if(!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("Invalid GitHub repository");
  if(rest.length===0) return `github://${owner}/${repo}`;
  if(rest[0]==="pull" && /^\d+$/.test(rest[1]||"") && rest.length===2) return `github://${owner}/${repo}#pr/${rest[1]}`;
  if(rest[0]==="issues" && /^\d+$/.test(rest[1]||"") && rest.length===2) return `github://${owner}/${repo}#issue/${rest[1]}`;
  if((rest[0]==="blob" || rest[0]==="tree") && rest.length>=2){
    const ref=rest[1];
    const path=rest.slice(2).join("/");
    return `github://${owner}/${repo}/${path}@${ref}`;
  }
  throw new Error("Unsupported GitHub URL shape; use blob/tree, pull, or issues URL");
}

export async function githubReadUri(uri:string,token?:string){
  const normalized=normalizeGithubReadUri(uri);
  const m=normalized.match(/^github:\/\/([^/]+)\/([^/#]+)(?:#(pr|issue)\/(\d+)|\/([^@]*)@?(.*))?$/i);
  if(!m) throw new Error("Invalid github:// URI");
  const [,owner,repo,kind,num,path="",ref="HEAD"]=m;
  if(kind==="pr") return githubPullRequest(owner,repo,Number(num),token);
  if(kind==="issue") return githubIssueOrPr(owner,repo,Number(num),token);
  return githubRepoContents(owner,repo,path,ref||"HEAD",token);
}

export async function githubRepoTree(owner:string,repo:string,ref="HEAD",token?:string){ return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(ref)}?recursive=1`,token); }
export async function githubSearchIssues(q:string,token?:string){ return githubApi(`search/issues?q=${encodeURIComponent(q)}`,token); }
export async function githubPullRequestFiles(owner:string,repo:string,number:number,token?:string){ return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/files`,token); }

export async function githubRepoDiff(owner:string,repo:string,base:string,head:string,token?:string){return githubApi(`repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,token);}
export async function githubRepoList(owner:string,repo:string,path="",ref="HEAD",token?:string){return githubRepoContents(owner,repo,path,ref,token);}
