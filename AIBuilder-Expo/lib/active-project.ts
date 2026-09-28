import AsyncStorage from "@react-native-async-storage/async-storage";
import { generateProjectStructure, type ProjectConfig, type ProjectTemplateId } from "./project-generator";
import { getPreferredProjectRoot } from "./termux-guard";

function utf8ToBase64(str: string): string {
  const utf8 = unescape(encodeURIComponent(str));
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  let output = "";
  for (let i = 0; i < utf8.length; i += 3) {
    const c1 = utf8.charCodeAt(i);
    const c2 = i + 1 < utf8.length ? utf8.charCodeAt(i + 1) : NaN;
    const c3 = i + 2 < utf8.length ? utf8.charCodeAt(i + 2) : NaN;
    const e1 = c1 >> 2;
    const e2 = ((c1 & 3) << 4) | (isNaN(c2) ? 0 : c2 >> 4);
    const e3 = isNaN(c2) ? 64 : ((c2 & 15) << 2) | (isNaN(c3) ? 0 : c3 >> 4);
    const e4 = isNaN(c3) ? 64 : c3 & 63;
    output += chars.charAt(e1) + chars.charAt(e2) + (e3 === 64 ? "=" : chars.charAt(e3)) + (e4 === 64 ? "=" : chars.charAt(e4));
  }
  return output;
}

export type { ProjectTemplateId };

export interface ActiveProject {
  id: string;
  name: string;
  packageName: string;
  path: string;
  createdAt: number;
  updatedAt: number;
  useCompose?: boolean;
  /** empty | compose | bottomnav */
  template?: ProjectTemplateId;
  minSdk?: number;
  targetSdk?: number;
  gitInit?: boolean;
}

export interface CreateProjectOptions {
  name: string;
  packageName?: string;
  useCompose?: boolean;
  template?: ProjectTemplateId;
  minSdk?: number;
  targetSdk?: number;
  gitInit?: boolean;
}

const STORAGE_KEY = "aibuilder.activeProject.v1";
const LIST_KEY = "aibuilder.projectList.v1";

export async function loadActiveProject(): Promise<ActiveProject | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ActiveProject;
  } catch {
    return null;
  }
}

export async function saveActiveProject(project: ActiveProject | null): Promise<void> {
  if (!project) {
    await AsyncStorage.removeItem(STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(project));
}

export async function listProjects(): Promise<ActiveProject[]> {
  try {
    const raw = await AsyncStorage.getItem(LIST_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function upsertProjectList(project: ActiveProject): Promise<void> {
  const list = await listProjects();
  const next = [project, ...list.filter((p) => p.id !== project.id)].slice(0, 30);
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(next));
}

export async function removeProjectFromList(id: string): Promise<void> {
  const list = await listProjects();
  await AsyncStorage.setItem(LIST_KEY, JSON.stringify(list.filter((p) => p.id !== id)));
}

export function createProjectMeta(opts: CreateProjectOptions | string, packageName?: string, useCompose = false): ActiveProject {
  const o: CreateProjectOptions =
    typeof opts === "string"
      ? { name: opts, packageName, useCompose }
      : opts;
  const safe = (o.name || "App").replace(/[^a-zA-Z0-9_-]/g, "_") || "App";
  const path = `${getPreferredProjectRoot()}/${safe}`;
  const now = Date.now();
  const template: ProjectTemplateId = o.template || (o.useCompose ? "compose" : "empty");
  const compose = template === "compose" || template === "bottomnav" ? true : !!o.useCompose;
  return {
    id: `proj_${now.toString(36)}`,
    name: safe,
    packageName: o.packageName || `com.aibuilder.${safe.toLowerCase()}`,
    path,
    createdAt: now,
    updatedAt: now,
    useCompose: compose,
    template,
    minSdk: o.minSdk ?? 24,
    targetSdk: o.targetSdk ?? 34,
    gitInit: !!o.gitInit,
  };
}

/** Файлы каркаса + shell-скрипт записи в Termux (вызывается агентом). */
export function buildScaffoldCommands(project: ActiveProject): string[] {
  const config: ProjectConfig = {
    name: project.name,
    packageName: project.packageName,
    useCompose: !!project.useCompose,
    projectPath: project.path,
    template: project.template || (project.useCompose ? "compose" : "empty"),
    minSdk: project.minSdk ?? 24,
    targetSdk: project.targetSdk ?? 34,
    gitInit: !!project.gitInit,
  };
  const files = generateProjectStructure(config);
  const cmds: string[] = [`mkdir -p "${project.path}"`];
  for (const [rel, content] of Object.entries(files)) {
    const full = `${project.path}/${rel}`;
    const dir = full.replace(/\/[^/]+$/, "");
    const b64 = utf8ToBase64(content);
    cmds.push(`mkdir -p "${dir}"`);
    cmds.push(`echo '${b64}' | base64 -d > "${full}"`);
  }
  if (project.gitInit) {
    cmds.push(`cd "${project.path}" && git init 2>/dev/null || true`);
  }
  cmds.push(`printf '%s\\n' "Scaffold written to ${project.path}"`);
  return cmds;
}

export function buildGradleAssembleCommands(projectPath: string): string[] {
  return [
    `cd "${projectPath}" && (test -f gradlew && chmod +x gradlew; true)`,
    `cd "${projectPath}" && export ANDROID_HOME="$PREFIX/opt/android-sdk" ANDROID_SDK_ROOT="$ANDROID_HOME" && bash gradlew assembleDebug --stacktrace --no-daemon`,
  ];
}

export function exportZipCommand(projectPath: string): string {
  const parent = projectPath.replace(/\/[^/]+$/, "");
  const base = projectPath.split("/").pop() || "project";
  return `cd "${parent}" && tar -czvf "${base}-export.tar.gz" "${base}" && ls -la "${base}-export.tar.gz"`;
}
