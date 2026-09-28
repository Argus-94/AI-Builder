/**
 * Environment used by AI Builder's package/tool installers.
 *
 * Termux itself keeps its package database and binaries under $PREFIX; that
 * must not be redirected. Only application-owned caches, Python user packages,
 * npm/Corepack state and XDG cache data are redirected into AIBuilderTermux.
 *
 * v444: fix "No mirror or mirror group selected" (exit 100).
 * Modern Termux requires $PREFIX/etc/termux/chosen_mirrors — writing only
 * sources.list is NOT enough for `pkg`.
 */

export const TERMUX_MAIN_REPO_LINE =
  "deb https://packages.termux.dev/apt/termux-main stable main";

/**
 * Ensure Termux apt can install packages.
 *
 * 1) Create chosen_mirrors if missing/empty (this is what pkg checks).
 * 2) Ensure sources.list has official termux-main.
 * 3) Optionally enable root-repo line (needed for some tools like frida).
 * 4) Never wipe user-selected mirrors if already present.
 */
export const TERMUX_REPO_PREFLIGHT =
  'PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"; ' +
  'mkdir -p "$PREFIX/etc/apt" "$PREFIX/etc/apt/sources.list.d" "$PREFIX/etc/termux"; ' +
  // chosen_mirrors — обязателен для pkg (иначе exit 100 "No mirror selected")
  'if [ ! -s "$PREFIX/etc/termux/chosen_mirrors" ]; then ' +
  '  printf "%s\\n" "https://packages.termux.dev/apt/" > "$PREFIX/etc/termux/chosen_mirrors"; ' +
  'fi; ' +
  // sources.list: официальный main, если нет ни одной termux-main строки
  'AIB_TERMUX_SOURCES="$PREFIX/etc/apt/sources.list"; ' +
  'if ! grep -Eqs "termux-main" "$AIB_TERMUX_SOURCES" "$PREFIX/etc/apt/sources.list.d/"*.list 2>/dev/null; then ' +
  '  printf "%s\\n" "deb https://packages.termux.dev/apt/termux-main stable main" > "$AIB_TERMUX_SOURCES"; ' +
  'fi; ' +
  // root-repo (опционально, для frida и т.п.) — только если файла ещё нет
  'if [ ! -f "$PREFIX/etc/apt/sources.list.d/root.list" ]; then ' +
  '  printf "%s\\n" "deb https://packages.termux.dev/apt/termux-root root stable" > "$PREFIX/etc/apt/sources.list.d/root.list"; ' +
  'fi; ';

/**
 * Lightweight env for checkCmd only — no apt writes, no repo mutation.
 * Avoids side-effects on every verify pass.
 */
export const AI_BUILDER_CHECK_ENV =
  'PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"; ' +
  'export PATH="$PREFIX/bin:$PREFIX/bin/applets:$PATH"; ';

export const AI_BUILDER_INSTALLER_ENV =
  'AIB_ROOT="/storage/emulated/0/AIBuilderTermux"; ' +
  'AIB_INTERNAL="$AIB_ROOT/.aibuilder"; ' +
  'AIB_CACHE="$AIB_INTERNAL/cache"; ' +
  'AIB_TMP="$AIB_INTERNAL/tmp"; ' +
  'AIB_PY_USER="$AIB_INTERNAL/python-user"; ' +
  'PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"; ' +
  'mkdir -p "$AIB_CACHE" "$AIB_TMP" "$AIB_PY_USER" "$AIB_CACHE/pip" "$AIB_CACHE/npm" "$AIB_INTERNAL/corepack" "$AIB_INTERNAL/pnpm"; ' +
  'export PYTHONUSERBASE="$AIB_PY_USER"; ' +
  'export PIP_CACHE_DIR="$AIB_CACHE/pip"; ' +
  'export NPM_CONFIG_CACHE="$AIB_CACHE/npm"; ' +
  'export COREPACK_HOME="$AIB_INTERNAL/corepack"; ' +
  'export PNPM_HOME="$AIB_INTERNAL/pnpm"; ' +
  'export XDG_CACHE_HOME="$AIB_CACHE/xdg"; ' +
  'export PATH="$AIB_PY_USER/bin:$AIB_INTERNAL/pnpm:$PREFIX/bin:$PATH"; ' +
  TERMUX_REPO_PREFLIGHT;

export function withInstallerEnvironment(command: string): string {
  return `${AI_BUILDER_INSTALLER_ENV}${command}`;
}

/** For verify/check only — no mirror writes. */
export function withCheckEnvironment(command: string): string {
  return `${AI_BUILDER_CHECK_ENV}${command}`;
}
