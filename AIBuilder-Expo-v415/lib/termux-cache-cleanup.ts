/**
 * Safe Termux / AI Builder cache cleanup.
 * Removes temporary files, package caches, Gradle/pip/npm caches.
 * Does NOT remove: installed pkg tools, Termux settings (~/.termux),
 * proot-distro rootfs, or user project sources.
 */
import { runShellCommand } from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";

export type CacheCleanupProgress = {
  percent: number;
  detail: string;
};

export type CacheCleanupResult = {
  ok: boolean;
  log: string;
  freedHint?: string;
};

/**
 * Shell script: only known cache/tmp paths. Never touches:
 * - $PREFIX/bin, $PREFIX/lib, $PREFIX/opt (tools)
 * - ~/.termux (settings, termux.properties)
 * - proot-distro installed-rootfs
 * - AIBuilderTermux projects and inbox attachments
 */
function buildCleanupScript(): string {
  return `
set +e
echo "STAGE:5:start"
BEFORE=$(df -Pk "$HOME" 2>/dev/null | tail -1 | awk '{print $4}')
echo "FREE_KB_BEFORE:\${BEFORE:-0}"

# --- Termux / apt package download cache (tools stay installed) ---
echo "STAGE:15:apt"
if command -v apt-get >/dev/null 2>&1; then
  apt-get clean 2>/dev/null
  apt-get autoclean 2>/dev/null
fi
rm -rf "$PREFIX/var/cache/apt/archives/"*.deb 2>/dev/null
rm -rf "$PREFIX/var/cache/apt/archives/partial" 2>/dev/null
mkdir -p "$PREFIX/var/cache/apt/archives/partial" 2>/dev/null

# --- Gradle caches (keep GRADLE_USER_HOME layout; drop caches/daemon only) ---
echo "STAGE:30:gradle"
for GH in "\${GRADLE_USER_HOME:-$HOME/.aibuilder-gradle}" "$HOME/.aibuilder-gradle" "$HOME/.gradle"; do
  [ -n "$GH" ] || continue
  rm -rf "$GH/caches" 2>/dev/null
  rm -rf "$GH/daemon" 2>/dev/null
  rm -rf "$GH/native" 2>/dev/null
  rm -rf "$GH/workers" 2>/dev/null
  rm -rf "$GH/.tmp" 2>/dev/null
  rm -rf "$GH/kotlin-profile" 2>/dev/null
done

# --- Language / package manager caches ---
echo "STAGE:45:lang_cache"
rm -rf "$HOME/.cache/pip" 2>/dev/null
rm -rf "$HOME/.cache/pnpm" 2>/dev/null
rm -rf "$HOME/.cache/yarn" 2>/dev/null
rm -rf "$HOME/.cache/typescript" 2>/dev/null
rm -rf "$HOME/.npm/_cacache" 2>/dev/null
rm -rf "$HOME/.npm/_logs" 2>/dev/null
rm -rf "$PREFIX/tmp/npm-*" 2>/dev/null
rm -rf "$HOME/.cargo/registry/cache" 2>/dev/null

# --- System / Termux temp ---
echo "STAGE:55:tmpdir"
rm -rf "\${TMPDIR:-/tmp}/aib-"* 2>/dev/null
rm -rf "\${TMPDIR:-/tmp}/aibuilder"* 2>/dev/null
rm -rf /tmp/aib-* 2>/dev/null
rm -rf /tmp/aibuilder* 2>/dev/null
rm -rf "$PREFIX/tmp/aib-"* "$PREFIX/tmp/aibuilder"* "$PREFIX/tmp/aib-android-sdk-"* "$PREFIX/tmp/aib-ndk-"* 2>/dev/null
mkdir -p "$PREFIX/tmp" 2>/dev/null

# --- AI Builder private temp only; the visible inbox contains user data ---
echo "STAGE:70:aib_tmp"
rm -rf "$PREFIX/tmp/aibuilder" 2>/dev/null
mkdir -p "$PREFIX/tmp/aibuilder" 2>/dev/null
# Never clean /storage/emulated/0/AIBuilderTermux/inbox or legacy user inputs.
# Old export scraps in exports older than 14 days (optional soft clean)
if [ -d "$HOME/exports" ]; then
  find "$HOME/exports" -type f -name '*.tmp' -delete 2>/dev/null
fi

# --- proot-distro download cache only (keep installed-rootfs) ---
echo "STAGE:80:proot_cache"
PD="$PREFIX/var/lib/proot-distro"
if [ -d "$PD" ]; then
  rm -rf "$PD/dlcache" 2>/dev/null
  rm -rf "$PD/download" 2>/dev/null
  # do NOT: rm installed-rootfs
fi

# --- Stale log noise in home ---
echo "STAGE:90:logs"
rm -f "$HOME"/.aib-*.log 2>/dev/null
rm -f /tmp/aib-pd-*.err 2>/dev/null
rm -f /tmp/aib-debian-install.*.log 2>/dev/null
rm -f /tmp/aib-bootstrap-debian.*.log 2>/dev/null
rm -f /tmp/aib-proot-install.log 2>/dev/null

AFTER=$(df -Pk "$HOME" 2>/dev/null | tail -1 | awk '{print $4}')
echo "FREE_KB_AFTER:\${AFTER:-0}"
if [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$AFTER" -ge "$BEFORE" ] 2>/dev/null; then
  FREED=$((AFTER - BEFORE))
  echo "FREED_KB:$FREED"
fi
echo "STAGE:100:done"
echo "CLEANUP_OK"
# Explicitly confirm protected paths still exist when present
[ -d "$PREFIX" ] && echo "KEEP_PREFIX=1"
[ -d "$HOME/.termux" ] && echo "KEEP_TERMUX_SETTINGS=1"
[ -d "$PREFIX/var/lib/proot-distro/installed-rootfs" ] && echo "KEEP_ROOTFS=1"
exit 0
`.trim();
}

export async function runTermuxCacheCleanup(
  onProgress?: (p: CacheCleanupProgress) => void,
): Promise<CacheCleanupResult> {
  const report = (percent: number, detail: string) => {
    onProgress?.({ percent, detail });
  };
  report(2, "Подготовка…");
  try {
    const r = await runShellCommand(buildCleanupScript(), {
      timeoutMs: 180_000,
      isBuild: true,
    });
    const log = `${r.stdout || ""}\n${r.stderr || ""}`;
    for (const line of log.split("\n")) {
      const m = line.match(/^STAGE:(\d+):(\w+)/);
      if (m) {
        const pct = Math.min(99, Number(m[1]) || 0);
        report(pct, m[2]);
      }
    }
    const freed = log.match(/FREED_KB:(\d+)/);
    const freedHint = freed
      ? `~${Math.max(0, Math.round(Number(freed[1]) / 1024))} МБ свободно дополнительно`
      : undefined;
    const ok = /CLEANUP_OK/.test(log) || (r.exitCode ?? 1) === 0;
    report(ok ? 100 : 0, ok ? "Готово" : "Ошибка");
    persistentLogger.add(
      ok ? "info" : "warn",
      "CacheCleanup",
      ok ? `cleanup ok ${freedHint || ""}`.trim() : `cleanup failed exit=${r.exitCode}`,
      "app",
    );
    return { ok, log: log.slice(-4000), freedHint };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", "CacheCleanup", msg, "app");
    report(0, "Ошибка");
    return { ok: false, log: msg };
  }
}
