/**
 * Export / import AI Builder durable profile (plan P2 — survive reinstall).
 * Prefers public Download/ when available so data outlives app uninstall.
 * Packs metadata + projects under HOME; not full rootfs.
 */
import { runShellCommand } from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";

export type ProfileTransferResult = {
  ok: boolean;
  path?: string;
  message: string;
};

function q(s: string): string {
  return JSON.stringify(s);
}

/** Best-effort path outside app-private storage (survives uninstall). */
export function defaultProfileExportPath(_homeRoot?: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  // Prefer shared storage; fallback to home/logs
  return `/storage/emulated/0/Download/AIBuilder-profile-${ts}.tar.gz`;
}

export function fallbackProfileExportPath(homeRoot: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${homeRoot.replace(/\/$/, "")}/logs/profile-export-${ts}.tar.gz`;
}

export async function exportProfileZip(destPath: string, homeRoot: string): Promise<ProfileTransferResult> {
  let dest = destPath.trim();
  if (!dest || dest.includes("..")) {
    return { ok: false, message: "invalid destination path" };
  }
  // Try primary dest; on failure retry under HOME/logs
  const tryExport = async (path: string) => {
    const cmd =
      `set -e; mkdir -p "$(dirname ${q(path)})"; cd ${q(homeRoot)}; ` +
      `tar -czf ${q(path)} metadata projects .aibuilder 2>/dev/null || tar -czf ${q(path)} metadata 2>/dev/null || true; ` +
      `test -f ${q(path)} && ls -la ${q(path)} && echo PROFILE_EXPORT_OK || (echo PROFILE_EXPORT_FAIL; exit 1)`;
    const r = await runShellCommand(cmd, { timeoutMs: 120_000 });
    const out = (r.stdout || "") + (r.stderr || "");
    const code = r.exitCode ?? r.code ?? 1;
    return { ok: code === 0 && out.includes("PROFILE_EXPORT_OK"), out, path, code };
  };

  try {
    persistentLogger.add("info", "Profile", `export → ${dest}`);
    let res = await tryExport(dest);
    if (!res.ok && dest.startsWith("/storage/")) {
      const fb = fallbackProfileExportPath(homeRoot);
      const res2 = await tryExport(fb);
      if (res2.ok) {
        return {
          ok: true,
          path: fb,
          message: `exported → ${fb} (Download unavailable; used HOME/logs)`,
        };
      }
      return { ok: false, path: dest, message: (res.out + "\n" + res2.out).slice(0, 500) };
    }
    if (res.ok) {
      persistentLogger.add("info", "Profile", `export OK ${dest}`);
      return { ok: true, path: dest, message: `exported → ${dest}` };
    }
    return { ok: false, path: dest, message: res.out.slice(0, 400) || `exit ${res.code}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function importProfileZip(sourcePath: string, homeRoot: string): Promise<ProfileTransferResult> {
  const src = sourcePath.trim();
  if (!src || src.includes("..")) {
    return { ok: false, message: "invalid source path" };
  }
  const cmd =
    `set -e; test -f ${q(src)}; mkdir -p ${q(homeRoot)}; cd ${q(homeRoot)}; ` +
    `tar -xzf ${q(src)}; echo PROFILE_IMPORT_OK`;
  try {
    persistentLogger.add("info", "Profile", `import ← ${src}`);
    const r = await runShellCommand(cmd, { timeoutMs: 180_000 });
    const out = (r.stdout || "") + (r.stderr || "");
    const code = r.exitCode ?? r.code ?? 1;
    if (code === 0 && out.includes("PROFILE_IMPORT_OK")) {
      persistentLogger.add("info", "Profile", `import OK ${src}`);
      return { ok: true, path: src, message: `imported from ${src}` };
    }
    return { ok: false, path: src, message: out.slice(0, 400) || `exit ${code}` };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
