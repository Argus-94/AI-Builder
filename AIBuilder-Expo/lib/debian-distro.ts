/**
 * Debian (proot-distro) install / export / import with progress events.
 * Not a network "download widget" only — tracks real stages of proot-distro.
 */
import { runShellCommand } from "./termux-bridge";
import { withForegroundTask } from "./foreground-task";

export type DistroProgress = {
  percent: number;
  stage: string;
  detail: string;
};

export type DistroOpResult = {
  ok: boolean;
  exitCode: number;
  log: string;
  path?: string;
};

const PROFILE = "debian";

function parseStageLine(line: string): DistroProgress | null {
  const m = line.match(/^STAGE:(\d+):(\w+)\s*(.*)$/);
  if (m) {
    return {
      percent: Math.min(100, Math.max(0, Number(m[1]) || 0)),
      stage: m[2],
      detail: (m[3] || m[2]).trim(),
    };
  }
  // Heuristics from proot-distro / apt noise
  const l = line.toLowerCase();
  if (/downloading|get:|fetched/.test(l)) return { percent: 35, stage: "download", detail: line.slice(0, 120) };
  if (/extracting|unpacking|tar/.test(l)) return { percent: 60, stage: "extract", detail: line.slice(0, 120) };
  if (/installing|setting up|configuring/.test(l)) return { percent: 80, stage: "install", detail: line.slice(0, 120) };
  if (/installed|finished|done|successfully/.test(l)) return { percent: 95, stage: "finalize", detail: line.slice(0, 120) };
  return null;
}

/** Check if debian rootfs is already registered with proot-distro. */
export async function isDebianInstalled(): Promise<boolean> {
  try {
    const r = await runShellCommand(
      `proot-distro list 2>/dev/null | grep -qiE '^\\s*${PROFILE}\\b|installed.*${PROFILE}' && echo YES || echo NO`,
      { timeoutMs: 20_000 },
    );
    return (r.stdout || "").includes("YES");
  } catch {
    return false;
  }
}

/**
 * Install Debian via proot-distro with stage progress.
 * If already installed — completes at 100% without re-download.
 */
export async function bootstrapDebian(
  onProgress?: (p: DistroProgress) => void,
): Promise<DistroOpResult> {
  return withForegroundTask("bootstrap", "Debian bootstrap", async (fgUpdate) => {
  const report = (percent: number, stage: string, detail: string) => {
    onProgress?.({ percent, stage, detail });
    fgUpdate(percent / 100, `${stage}: ${detail}`.slice(0, 80));
  };

  report(3, "check", "Проверка proot-distro…");
  const has = await runShellCommand("command -v proot-distro >/dev/null 2>&1; echo $?", { timeoutMs: 10_000 });
  if ((has.stdout || "").trim() !== "0") {
    report(0, "error", "proot-distro не установлен");
    return { ok: false, exitCode: 127, log: "proot-distro missing — pkg install proot-distro" };
  }

  report(10, "probe", "Проверка, установлен ли Debian…");
  if (await isDebianInstalled()) {
    report(100, "already", "Debian уже установлен — повторная загрузка не нужна");
    return { ok: true, exitCode: 0, log: "already_installed" };
  }

  report(15, "install_start", "Установка Debian (это не «скачивание приложения», а образ rootfs)…");

  // Real install; stdout/stderr accumulated — parse for stages
  const script = `
set -e
echo "STAGE:20:prepare"
# Reset partial broken install if any
proot-distro reset ${PROFILE} 2>/dev/null || true
echo "STAGE:30:install_begin"
proot-distro install ${PROFILE} 2>&1 | while IFS= read -r line; do
  echo "LOG:$line"
  case "$line" in
    *[Dd]ownload*|*[Ff]etch*|Get:*) echo "STAGE:45:download $line";;
    *[Ee]xtract*|*[Uu]npack*|*tar *) echo "STAGE:65:extract $line";;
    *[Ii]nstall*|*Setting up*|*Configuring*) echo "STAGE:82:configure $line";;
  esac
done
echo "STAGE:100:done"
`;

  const r = await runShellCommand(script, { timeoutMs: 45 * 60_000 });
  const log = `${r.stdout || ""}\n${r.stderr || ""}`;
  for (const line of log.split("\n")) {
    const plain = line.replace(/^LOG:/, "");
    const p = parseStageLine(plain.startsWith("STAGE:") ? plain : line);
    if (p) report(p.percent, p.stage, p.detail || plain.slice(0, 100));
  }

  const ok = (r.exitCode ?? 1) === 0 || log.includes("STAGE:100:done") || (await isDebianInstalled());
  report(ok ? 100 : 0, ok ? "done" : "failed", ok ? "Debian готов" : "Установка не завершилась");
  return { ok, exitCode: r.exitCode ?? (ok ? 0 : 1), log: log.slice(-8000) };
  });
}

/** Export installed debian rootfs to a .tar.gz under AIBuilder backups/exports. */
export async function exportDebian(
  destPath: string,
  onProgress?: (p: DistroProgress) => void,
): Promise<DistroOpResult> {
  return withForegroundTask("backup", "Debian export", async (fgUpdate) => {
  const report = (percent: number, stage: string, detail: string) => {
    onProgress?.({ percent, stage, detail });
    fgUpdate(percent / 100, detail.slice(0, 80));
  };
  report(5, "check", "Проверка Debian…");
  if (!(await isDebianInstalled())) {
    return { ok: false, exitCode: 1, log: "Debian не установлен — нечего экспортировать" };
  }

  const safeDest = destPath.replace(/'/g, "");
  report(15, "export", `Архивация в ${safeDest}…`);

  // proot-distro backup if available, else tar rootfs
  const script = `
set -e
DEST='${safeDest}'
mkdir -p "$(dirname "$DEST")"
echo "STAGE:25:backup_start"
if proot-distro backup ${PROFILE} --output "$DEST" 2>/tmp/aib-pd-backup.err; then
  echo "STAGE:90:backup_ok"
else
  echo "STAGE:40:tar_fallback"
  ROOT="$PREFIX/var/lib/proot-distro/installed-rootfs/${PROFILE}"
  if [ ! -d "$ROOT" ]; then
    echo "ROOTFS_MISSING:$ROOT" >&2
    exit 2
  fi
  tar -czf "$DEST" -C "$(dirname "$ROOT")" "$(basename "$ROOT")" 2>&1 | tail -5
  echo "STAGE:90:tar_ok"
fi
ls -lh "$DEST"
echo "STAGE:100:done"
echo "EXPORT_PATH:$DEST"
`;

  const r = await runShellCommand(script, { timeoutMs: 30 * 60_000 });
  const log = `${r.stdout || ""}\n${r.stderr || ""}`;
  for (const line of log.split("\n")) {
    const p = parseStageLine(line);
    if (p) report(p.percent, p.stage, p.detail);
  }
  const pathMatch = log.match(/EXPORT_PATH:(.+)/);
  const path = pathMatch?.[1]?.trim() || safeDest;
  const ok = (r.exitCode ?? 1) === 0;
  report(ok ? 100 : 0, ok ? "done" : "failed", ok ? `Экспорт: ${path}` : "Ошибка экспорта");
  return { ok, exitCode: r.exitCode ?? 1, log: log.slice(-6000), path };
  });
}

/** Import debian from a local archive (tar.gz / proot-distro backup). */
export async function importDebian(
  sourcePath: string,
  onProgress?: (p: DistroProgress) => void,
): Promise<DistroOpResult> {
  const report = (percent: number, stage: string, detail: string) => onProgress?.({ percent, stage, detail });
  const src = sourcePath.replace(/'/g, "");
  report(5, "check", `Файл: ${src}`);

  const script = `
set -e
SRC='${src}'
if [ ! -f "$SRC" ]; then
  echo "FILE_MISSING:$SRC" >&2
  exit 2
fi
echo "STAGE:20:import_start"
if proot-distro restore "$SRC" 2>/tmp/aib-pd-restore.err; then
  echo "STAGE:90:restore_ok"
else
  echo "STAGE:40:manual_extract"
  ROOT="$PREFIX/var/lib/proot-distro/installed-rootfs"
  mkdir -p "$ROOT"
  # Remove old debian if present
  rm -rf "$ROOT/${PROFILE}"
  tar -xzf "$SRC" -C "$ROOT" 2>&1 | tail -8
  # If archive contained top-level "debian" dir — ok; else move single dir
  echo "STAGE:85:extract_done"
fi
echo "STAGE:100:done"
proot-distro list 2>/dev/null | head -20 || true
`;

  const r = await runShellCommand(script, { timeoutMs: 30 * 60_000 });
  const log = `${r.stdout || ""}\n${r.stderr || ""}`;
  for (const line of log.split("\n")) {
    const p = parseStageLine(line);
    if (p) report(p.percent, p.stage, p.detail);
  }
  const ok = (r.exitCode ?? 1) === 0 || (await isDebianInstalled());
  report(ok ? 100 : 0, ok ? "done" : "failed", ok ? "Импорт завершён" : "Ошибка импорта");
  return { ok, exitCode: r.exitCode ?? (ok ? 0 : 1), log: log.slice(-6000) };
}

export function defaultExportPath(homeRoot: string): string {
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  return `${homeRoot}/exports/debian-${ts}.tar.gz`;
}
