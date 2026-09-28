/**
 * Пользовательские инструменты для меню «Пакеты».
 * Хранятся в AsyncStorage, устанавливаются/проверяются/удаляются
 * так же, как compile/reverse пакеты (Termux shell + withInstallerEnvironment).
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { runShellCommand, type TermuxCommandResult } from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";
import { withInstallerEnvironment, withCheckEnvironment } from "./termux-installer-env";

export type CustomToolSection = "compile" | "reverse";

/** How installCmd is generated from simpler fields */
export type CustomInstallKind =
  | "pkg" // pkg install -y <packages>
  | "pip" // pip install <packages>
  | "npm" // npm install -g <packages>
  | "custom"; // raw shell

export interface CustomToolDef {
  id: string;
  /** Section in the packages menu */
  section: CustomToolSection;
  name: string;
  nameEn: string;
  description?: string;
  /** Ionicons name */
  icon?: string;
  installKind: CustomInstallKind;
  /** For pkg/pip/npm: space-separated package names */
  packageNames?: string;
  installCmd: string;
  checkCmd: string;
  removeCmd: string;
  estimateSec: number;
  order: number;
  createdAt: number;
  updatedAt: number;
}

const STORAGE_KEY = "aibuilder.custom_tools.v1";
const INSTALL_TIMEOUT_MS = 900_000;
const CHECK_TIMEOUT_MS = 25_000;
const REMOVE_TIMEOUT_MS = 180_000;
const UPDATE_TIMEOUT_MS = 300_000;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "tool"
  );
}

export function buildCommandsFromKind(
  kind: CustomInstallKind,
  packageNames: string,
  customInstall?: string,
  customCheck?: string,
  customRemove?: string
): { installCmd: string; checkCmd: string; removeCmd: string } {
  const pkgs = packageNames.trim().replace(/\s+/g, " ");
  const first = pkgs.split(/\s+/)[0] || "tool";

  if (kind === "pkg") {
    return {
      installCmd: `set +e
pkg install -y ${pkgs} 2>&1
if command -v ${first} >/dev/null 2>&1 || dpkg -s ${first} >/dev/null 2>&1; then
  echo CUSTOM_PKG_OK
  exit 0
fi
echo CUSTOM_PKG_FAIL
exit 1`,
      checkCmd: `command -v ${first} >/dev/null 2>&1 || dpkg -s ${first} >/dev/null 2>&1`,
      removeCmd: `pkg uninstall -y ${pkgs} 2>/dev/null; true`,
    };
  }
  if (kind === "pip") {
    return {
      installCmd: `set +e
pkg install -y python 2>/dev/null || true
pip install --upgrade pip 2>/dev/null || true
pip install ${pkgs} 2>&1
python -c "import ${first.replace(/-/g, '_')}" 2>/dev/null && echo CUSTOM_PIP_OK && exit 0
command -v ${first} >/dev/null 2>&1 && echo CUSTOM_PIP_OK && exit 0
echo CUSTOM_PIP_FAIL
exit 1`,
      checkCmd: `python -c "import ${first.replace(/-/g, '_')}" >/dev/null 2>&1 || command -v ${first} >/dev/null 2>&1`,
      removeCmd: `pip uninstall -y ${pkgs} 2>/dev/null; true`,
    };
  }
  if (kind === "npm") {
    return {
      installCmd: `set +e
pkg install -y nodejs-lts 2>/dev/null || pkg install -y nodejs 2>/dev/null || true
npm install -g ${pkgs} 2>&1
command -v ${first} >/dev/null 2>&1 && echo CUSTOM_NPM_OK && exit 0
echo CUSTOM_NPM_FAIL
exit 1`,
      checkCmd: `command -v ${first} >/dev/null 2>&1`,
      removeCmd: `npm uninstall -g ${pkgs} 2>/dev/null; true`,
    };
  }
  // custom
  return {
    installCmd: (customInstall || "echo NO_INSTALL_CMD; exit 1").trim(),
    checkCmd: (customCheck || "true").trim(),
    removeCmd: (customRemove || "true").trim(),
  };
}

export async function loadCustomTools(): Promise<CustomToolDef[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => x && typeof x.id === "string" && x.installCmd);
  } catch {
    return [];
  }
}

export async function saveCustomTools(list: CustomToolDef[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export async function upsertCustomTool(
  input: Omit<CustomToolDef, "id" | "createdAt" | "updatedAt" | "order"> & {
    id?: string;
    order?: number;
  }
): Promise<CustomToolDef> {
  const list = await loadCustomTools();
  const now = Date.now();
  if (input.id) {
    const idx = list.findIndex((t) => t.id === input.id);
    if (idx >= 0) {
      const next: CustomToolDef = {
        ...list[idx],
        ...input,
        id: input.id,
        updatedAt: now,
      };
      list[idx] = next;
      await saveCustomTools(list);
      return next;
    }
  }
  const base = slugify(input.nameEn || input.name);
  let id = `custom-${base}`;
  let n = 1;
  while (list.some((t) => t.id === id)) {
    id = `custom-${base}-${n++}`;
  }
  const maxOrder = list.reduce((m, t) => Math.max(m, t.order || 0), 0);
  const tool: CustomToolDef = {
    id,
    section: input.section,
    name: input.name,
    nameEn: input.nameEn || input.name,
    description: input.description,
    icon: input.icon || "extension-puzzle-outline",
    installKind: input.installKind,
    packageNames: input.packageNames,
    installCmd: input.installCmd,
    checkCmd: input.checkCmd,
    removeCmd: input.removeCmd,
    estimateSec: Math.max(10, input.estimateSec || 60),
    order: input.order ?? maxOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  list.push(tool);
  await saveCustomTools(list);
  return tool;
}

export async function deleteCustomTool(id: string): Promise<boolean> {
  const list = await loadCustomTools();
  const next = list.filter((t) => t.id !== id);
  if (next.length === list.length) return false;
  await saveCustomTools(next);
  return true;
}

export async function verifyCustomToolInstalled(def: CustomToolDef): Promise<boolean> {
  try {
    const r = await runShellCommand(withCheckEnvironment(def.checkCmd), {
      timeoutMs: CHECK_TIMEOUT_MS,
    });
    return r.exitCode === 0 && !r.timedOut;
  } catch {
    return false;
  }
}

export async function installCustomTool(
  def: CustomToolDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `CustomTool:${def.id}`;
  const tick = (p: number, detail: string) => {
    if (shouldAbort?.()) return;
    onProgress(Math.min(99, Math.max(0, p)), detail);
  };

  try {
    tick(5, "Подготовка…");
    await delay(150);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    try {
      await runShellCommand(
        withInstallerEnvironment(
          'pkg update -y 2>&1 | tail -5 || true'
        ),
        { timeoutMs: UPDATE_TIMEOUT_MS }
      );
    } catch (e) {
      persistentLogger.add("warn", tag, `pkg update soft-fail: ${e}`);
    }

    tick(15, `Установка ${def.name}…`);
    const est = Math.max(20, def.estimateSec);
    const start = Date.now();
    let installDone = false;
    let installResult: TermuxCommandResult | null = null;
    let installError: string | undefined;

    const progressTimer = setInterval(() => {
      if (installDone || shouldAbort?.()) return;
      const elapsed = (Date.now() - start) / 1000;
      const ratio = Math.min(1, elapsed / est);
      const p = 15 + Math.floor(55 * (1 - Math.exp(-2.2 * ratio)));
      tick(p, `Установка ${def.name}… ${Math.round(elapsed)}с`);
    }, 800);

    try {
      installResult = await runShellCommand(withInstallerEnvironment(def.installCmd), {
        timeoutMs: INSTALL_TIMEOUT_MS,
        isBuild: true,
      });
    } catch (e: unknown) {
      installError = e instanceof Error ? e.message : String(e);
    } finally {
      installDone = true;
      clearInterval(progressTimer);
    }

    if (shouldAbort?.()) return { ok: false, error: "aborted" };
    if (installError) {
      tick(0, "Ошибка");
      return { ok: false, error: installError };
    }
    if (!installResult || installResult.timedOut) {
      tick(0, "Таймаут");
      return { ok: false, error: "timeout" };
    }

    tick(85, "Проверка…");
    await delay(400);
    const ok = await verifyCustomToolInstalled(def);
    if (ok) {
      tick(100, "Установлено");
      return { ok: true };
    }

    const rawOut = (installResult.stderr || "") + "\n" + (installResult.stdout || "");
    const cleaned = rawOut
      .split("\n")
      .filter((l) => {
        const t = l.trim();
        if (!t) return false;
        if (/apt does not have a stable CLI/i.test(t)) return false;
        return true;
      })
      .join("\n")
      .trim()
      .slice(-400);

    tick(0, "Не подтверждено");
    return {
      ok: false,
      error:
        installResult.exitCode !== 0
          ? `exit ${installResult.exitCode}: ${cleaned || "install failed"}`
          : `verify failed: ${cleaned || "not detected after install"}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}

export async function removeCustomToolPkg(
  def: CustomToolDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `CustomTool:${def.id}`;
  try {
    onProgress(10, "Удаление…");
    await delay(150);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    const r = await runShellCommand(withInstallerEnvironment(def.removeCmd), {
      timeoutMs: REMOVE_TIMEOUT_MS,
      isBuild: true,
    });
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    onProgress(80, "Проверка…");
    await delay(300);
    const still = await verifyCustomToolInstalled(def);
    if (!still) {
      onProgress(100, "Удалено");
      return { ok: true };
    }
    if (r.exitCode === 0 && !r.timedOut && still) {
      return {
        ok: false,
        error: "uninstall exit 0, but verify still detects the tool",
      };
    }
    return {
      ok: false,
      error: r.timedOut ? "timeout" : `exit ${r.exitCode}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}
