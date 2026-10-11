/**
 * Shell builders for package operations in the user's existing Termux environment.
 * A tightly scoped official-main retry is possible without changing persistent
 * source files: it runs with an ephemeral APT_CONFIG and isolated package lists.
 */

/**
 * Short, shell-safe label for the install log. The script itself must never be
 * placed inside a double-quoted echo: multi-line scripts contain quotes and
 * would break the wrapper (this made SDK cmdline-tools fail inside the app).
 */
export function describeInstallCommand(command: string): string {
  const lines = String(command || "").split(String.fromCharCode(10)).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1) return "install script (" + lines.length + " lines)";
  const safe = (lines[0] || "").replace(/[^A-Za-z0-9 _.:\/=+,-]/g, "").slice(0, 100);
  return safe || "install script";
}

const TERMUX_TRUSTED_FALLBACK_URL = "https://packages.termux.dev/apt/termux-main";

const TERMUX_PACKAGE_INDEX_CHECK =
  'TERMUX_INDEX_FOUND=0; for _index in "$AIB_APT_LISTS"/*Packages*; do ' +
  'if [ -f "$_index" ] && [ -s "$_index" ]; then TERMUX_INDEX_FOUND=1; break; fi; done; ' +
  '[ "$TERMUX_INDEX_FOUND" = 1 ]';

/** Check for a configured user source, but never invoke termux-change-repo. */
export const TERMUX_REPO_PREFLIGHT =
  'PREFIX="${PREFIX:-/data/data/com.termux/files/usr}"; ' +
  'mkdir -p "$PREFIX/etc/termux" "$PREFIX/etc/apt" "$PREFIX/var/lib/apt/lists/partial"; ' +
  'has_user_sources=0; for _source in "$PREFIX/etc/apt/sources.list" "$PREFIX"/etc/apt/sources.list.d/*.list "$PREFIX"/etc/apt/sources.list.d/*.sources; do ' +
  '  if [ -f "$_source" ] && [ -s "$_source" ]; then has_user_sources=1; break; fi; ' +
  'done; ' +
  'if [ ! -s "$PREFIX/etc/termux/chosen_mirrors" ] && [ "$has_user_sources" = 0 ]; then ' +
  '  echo "[aib] no Termux apt source configuration found; configure a source manually in Termux"; ' +
  'fi; ' +
  'export DEBIAN_FRONTEND=noninteractive; ';

const TERMUX_APT_UPDATE_OPTIONS =
  '-y -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30';

const TERMUX_APT_TRANSACTION_HELPERS = [
  'AIB_TXN_DIR=""; AIB_FALLBACK_DIR=""; AIB_APT_LISTS="$PREFIX/var/lib/apt/lists";',
  'AIB_ORIGINAL_APT_CONFIG_SET="${APT_CONFIG+x}"; AIB_ORIGINAL_APT_CONFIG="${APT_CONFIG-}";',
  'aib_cleanup_apt_transaction() {',
  '  if [ -n "$AIB_TXN_DIR" ]; then case "$AIB_TXN_DIR" in "$PREFIX"/tmp/aib-termux-apt.*) rm -rf -- "$AIB_TXN_DIR" ;; esac; fi;',
  '  if [ "$AIB_ORIGINAL_APT_CONFIG_SET" = x ]; then export APT_CONFIG="$AIB_ORIGINAL_APT_CONFIG"; else unset APT_CONFIG; fi;',
  '}',
  'aib_new_apt_transaction() {',
  '  AIB_TXN_DIR=$(mktemp -d "$PREFIX/tmp/aib-termux-apt.XXXXXX") || return 1;',
  '  mkdir -p "$AIB_TXN_DIR" || return 1;',
  '}',
  'aib_fallback_source_is_eligible() {',
  '  _source_list="$PREFIX/etc/apt/sources.list"; [ -s "$_source_list" ] || return 1;',
  '  _active_count=$(grep -Ec "^[[:space:]]*[^#[:space:]]" "$_source_list" 2>/dev/null || true); [ "$_active_count" = 1 ] || return 1;',
  '  AIB_CONFIGURED_URL=$(sed -n -E "s|^[[:space:]]*deb[[:space:]]+(https://[^[:space:]]+/apt/termux-main/?)[[:space:]]+stable[[:space:]]+main[[:space:]]*$|\\1|p" "$_source_list");',
  '  [ -n "$AIB_CONFIGURED_URL" ] || return 1;',
  '  case "$AIB_CONFIGURED_URL" in *"@"*) return 1 ;; esac;',
  '  AIB_CONFIGURED_HOST=${AIB_CONFIGURED_URL#https://}; AIB_CONFIGURED_HOST=${AIB_CONFIGURED_HOST%%/*}; [ -n "$AIB_CONFIGURED_HOST" ] || return 1;',
  '  [ "$AIB_CONFIGURED_HOST" != "packages.termux.dev" ] || return 1;',
  '  for _source in "$PREFIX"/etc/apt/sources.list.d/*.list "$PREFIX"/etc/apt/sources.list.d/*.sources; do',
  '    [ -f "$_source" ] || continue;',
  '    if grep -Eq "^[[:space:]]*[^#[:space:]]" "$_source" 2>/dev/null; then return 1; fi;',
  '  done;',
  '  [ -z "${APT_CONFIG-}" ] || return 1;',
  '  for _apt_conf in "$PREFIX/etc/apt/apt.conf" "$PREFIX"/etc/apt/apt.conf.d/*; do',
  '    [ -f "$_apt_conf" ] || continue;',
  '    if grep -Eiq "Dir::Etc::(sourcelist|sourceparts)|Dir::State::lists|AllowUnauthenticated|AllowInsecureRepositories|AllowDowngradeToInsecureRepositories" "$_apt_conf"; then return 1; fi;',
  '  done;',
  '  return 0;',
  '}',
  'aib_transient_mirror_unavailable() {',
  '  [ "$1" != 0 ] || return 1;',
  '  grep -Fqi -- "$AIB_CONFIGURED_HOST" "$AIB_UP_LOG" || return 1;',
  '  if grep -Eiq "NO_PUBKEY|EXPKEYSIG|BADSIG|REVKEYSIG|signature|not signed|signatures could not be verified|Hash Sum mismatch|Release file.*not valid|Clearsigned file.*not valid|does not have a Release file|Malformed entry|Conflicting values|sources could not be read|Unable to locate package|no installation candidate|unmet dependencies|held broken packages|dependency problems|Unable to correct problems|Permission denied|Could not open lock|Could not get lock|unable to lock|read-only file system|No space left|not enough (free )?space|disk is full|Could not create temporary file|Couldn.t create temporary file|404([[:space:]]|$)" "$AIB_UP_LOG"; then return 1; fi;',
  '  grep -Eiq "Temporary failure resolving|Connection timed out|Could not connect to|Failed to connect to|Connection refused|502 Bad Gateway|503 Service Unavailable|504 Gateway Time-out" "$AIB_UP_LOG";',
  '}',
  'aib_prepare_trusted_fallback() {',
  '  AIB_FALLBACK_DIR="$AIB_TXN_DIR/fallback";',
  '  mkdir -p "$AIB_FALLBACK_DIR/lists/partial" || return 1;',
  '  printf "deb ' + TERMUX_TRUSTED_FALLBACK_URL + ' stable main\\n" > "$AIB_FALLBACK_DIR/sources.list" || return 1;',
  '  printf \'Dir::Etc::sourcelist "%s"; Dir::Etc::sourceparts "-"; Dir::State::lists "%s";\\n\' "$AIB_FALLBACK_DIR/sources.list" "$AIB_FALLBACK_DIR/lists" > "$AIB_FALLBACK_DIR/apt.conf" || return 1;',
  '  export APT_CONFIG="$AIB_FALLBACK_DIR/apt.conf"; AIB_APT_LISTS="$AIB_FALLBACK_DIR/lists";',
  '  return 0;',
  '}',
].join(String.fromCharCode(10)) + String.fromCharCode(10);

const TERMUX_APT_UPDATE_CAPTURE =
  'AIB_UP_STDOUT="$AIB_TXN_DIR/update.stdout"; AIB_UP_STDERR="$AIB_TXN_DIR/update.stderr"; ' +
  'apt-get update ' + TERMUX_APT_UPDATE_OPTIONS + ' >"$AIB_UP_STDOUT" 2>"$AIB_UP_STDERR"; upd=$?; ' +
  ': >"$AIB_UP_LOG"; cat "$AIB_UP_STDOUT" >>"$AIB_UP_LOG"; cat "$AIB_UP_STDERR" >>"$AIB_UP_LOG"; ';

function buildFallbackUpdateBlock(): string {
  return (
    'if [ "$upd" != 0 ] && aib_fallback_source_is_eligible && aib_transient_mirror_unavailable "$upd"; then ' +
    '  AIB_CONFIGURED_UPDATE_EXIT="$upd"; ' +
    '  echo "[aib] configured Termux main mirror has a confirmed temporary transport failure; retrying once with the official Termux main repository"; ' +
    '  echo "[aib] configured-mirror apt stdout:"; cat "$AIB_UP_STDOUT"; ' +
    '  echo "[aib] configured-mirror apt stderr:"; cat "$AIB_UP_STDERR" >&2; ' +
    '  if aib_prepare_trusted_fallback; then ' +
    '    AIB_FALLBACK_STDOUT="$AIB_FALLBACK_DIR/update.stdout"; AIB_FALLBACK_STDERR="$AIB_FALLBACK_DIR/update.stderr"; AIB_FALLBACK_LOG="$AIB_FALLBACK_DIR/update.log"; ' +
    '    apt-get update ' + TERMUX_APT_UPDATE_OPTIONS + ' >"$AIB_FALLBACK_STDOUT" 2>"$AIB_FALLBACK_STDERR"; upd=$?; ' +
    '    : >"$AIB_FALLBACK_LOG"; cat "$AIB_FALLBACK_STDOUT" >>"$AIB_FALLBACK_LOG"; cat "$AIB_FALLBACK_STDERR" >>"$AIB_FALLBACK_LOG"; ' +
    '    echo "[aib] trusted official Termux main apt stdout:"; cat "$AIB_FALLBACK_STDOUT"; ' +
    '    echo "[aib] trusted official Termux main apt stderr:"; cat "$AIB_FALLBACK_STDERR" >&2; ' +
    '    echo "AIB_APT_CONFIGURED_UPDATE_EXIT:$AIB_CONFIGURED_UPDATE_EXIT"; ' +
    '    echo "AIB_APT_FALLBACK_UPDATE_EXIT:$upd"; ' +
    '    if [ "$upd" = 0 ]; then ' + TERMUX_PACKAGE_INDEX_CHECK + '; AIB_INDEX_STATUS=$?; ' +
    '      if [ "$AIB_INDEX_STATUS" != 0 ]; then upd=100; AIB_INDEX_DIAGNOSTIC="[aib] official fallback apt-get update returned 0 but produced no non-empty Termux Packages indexes"; fi; ' +
    '    fi; ' +
    '  else ' +
    '    echo "[aib] trusted fallback preparation failed; no package operation was started"; ' +
    '  fi; ' +
    'fi; '
  );
}

function emitUpdateFailureLog(): string {
  return (
    'echo "[aib] APT_UPDATE_DIAGNOSTIC_BEGIN"; ' +
    'if [ -n "$AIB_INDEX_DIAGNOSTIC" ]; then echo "$AIB_INDEX_DIAGNOSTIC"; fi; ' +
    'echo "[aib] full apt update log preserved at $AIB_UP_LOG"; ' +
    'if [ -f "$AIB_UP_LOG" ]; then cat "$AIB_UP_LOG"; else echo "[aib] apt update log is unavailable: $AIB_UP_LOG"; fi; ' +
    'if [ -f "$AIB_UP_STDERR" ]; then cat "$AIB_UP_STDERR" >&2; fi; ' +
    'if [ -n "${AIB_FALLBACK_LOG-}" ]; then echo "[aib] full official fallback apt update log was temporary and has been cleaned"; ' +
    '  if [ -f "$AIB_FALLBACK_LOG" ]; then cat "$AIB_FALLBACK_LOG"; fi; ' +
    '  if [ -f "$AIB_FALLBACK_DIR/update.stderr" ]; then cat "$AIB_FALLBACK_DIR/update.stderr" >&2; fi; ' +
    'fi; ' +
    'echo "[aib] configured Termux sources were preserved"; ' +
    'echo "[aib] APT_UPDATE_DIAGNOSTIC_END"; '
  );
}

const TERMUX_APT_UPDATE_SEQUENCE =
  'AIB_INDEX_DIAGNOSTIC=""; AIB_FALLBACK_LOG=""; ' +
  TERMUX_APT_UPDATE_CAPTURE +
  buildFallbackUpdateBlock() +
  'if [ "$upd" = 0 ]; then ' + TERMUX_PACKAGE_INDEX_CHECK + '; AIB_INDEX_STATUS=$?; ' +
  '  if [ "$AIB_INDEX_STATUS" != 0 ]; then upd=100; AIB_INDEX_DIAGNOSTIC="[aib] apt-get update returned 0 but produced no non-empty Termux Packages indexes"; fi; ' +
  'fi; ';

/** apt-get update with at most one temporary, authenticated Termux-main retry. */
export const TERMUX_MIRROR_REPAIR =
  'set +e; ' +
  TERMUX_REPO_PREFLIGHT +
  'AIB_UP_LOG="$PREFIX/tmp/aib-apt-update.log"; mkdir -p "$PREFIX/tmp"; ' +
  TERMUX_APT_TRANSACTION_HELPERS +
  'aib_new_apt_transaction || { echo "[aib] cannot create temporary apt transaction files under $PREFIX/tmp"; exit 73; }; ' +
  'trap aib_cleanup_apt_transaction EXIT; ' +
  TERMUX_APT_UPDATE_SEQUENCE +
  'echo "[aib] apt-get update using configured Termux sources (or a one-shot trusted fallback when eligible)"; ' +
  'if [ "$upd" = 0 ]; then cat "$AIB_UP_STDOUT"; cat "$AIB_UP_STDERR" >&2; ' +
  'else ' + emitUpdateFailureLog() +
  '  echo "[aib] apt-get update failed (exit=$upd); configured Termux sources were preserved"; ' +
  '  echo "AIB_APT_UPDATE_EXIT:$upd"; ' +
  'fi; ' +
  'echo "AIB_MIRROR_REPAIR_DONE upd=$upd"; ' +
  'exit "$upd"; ';

/** Strict Termux package wrapper. Update failure returns its actual status and prevents install. */
export function wrapTermuxAptInstallWithUpdate(installCmd: string, emitPkgMarkers = false): string {
  // c is executable shell syntax inside a subshell, not data inside a quoted argument.
  const c = String(installCmd || "").trim();
  const updatePkgMarker = emitPkgMarkers ? 'echo "AIB_PKG_UPDATE_EXIT:$upd"; ' : "";
  const installPkgMarker = emitPkgMarkers
    ? 'echo "AIB_PKG_INSTALL_EXIT:$ec"; echo "PKG_EXIT:$ec"; '
    : "";
  return (
    'set +e; ' +
    TERMUX_REPO_PREFLIGHT +
    'AIB_UP_LOG="$PREFIX/tmp/aib-apt-update.log"; AIB_INSTALL_LOG="$PREFIX/tmp/aib-apt-install.log"; mkdir -p "$PREFIX/tmp"; ' +
    TERMUX_APT_TRANSACTION_HELPERS +
    'aib_new_apt_transaction || { echo "[aib] cannot create temporary apt transaction files under $PREFIX/tmp"; exit 73; }; ' +
    'trap aib_cleanup_apt_transaction EXIT; ' +
    TERMUX_APT_UPDATE_SEQUENCE +
    'echo "[aib] apt-get update using configured Termux sources (or a one-shot trusted fallback when eligible)"; ' +
    updatePkgMarker +
    'if [ "$upd" != 0 ]; then ' +
    emitUpdateFailureLog() +
    '  echo "[aib] apt-get update failed (exit=$upd); configured Termux sources were preserved"; ' +
    '  echo "AIB_APT_UPDATE_EXIT:$upd"; echo "AIB_APT_EXIT:$upd"; exit "$upd"; ' +
    'fi; ' +
    'cat "$AIB_UP_STDOUT"; cat "$AIB_UP_STDERR" >&2; ' +
    'echo "[aib] run: ' + describeInstallCommand(c) + '"; ' +
    'AIB_INSTALL_STDOUT="$AIB_TXN_DIR/install.stdout"; AIB_INSTALL_STDERR="$AIB_TXN_DIR/install.stderr"; ' +
    '(' + c + ') >"$AIB_INSTALL_STDOUT" 2>"$AIB_INSTALL_STDERR"; ec=$?; ' +
    ': >"$AIB_INSTALL_LOG"; cat "$AIB_INSTALL_STDOUT" >>"$AIB_INSTALL_LOG"; cat "$AIB_INSTALL_STDERR" >>"$AIB_INSTALL_LOG"; ' +
    'if [ "$ec" != 0 ]; then ' +
    '  echo "[aib] install exit=$ec — attempting dpkg/apt repair"; ' +
    '  dpkg --configure -a >>"$AIB_INSTALL_STDOUT" 2>>"$AIB_INSTALL_STDERR" || true; ' +
    '  apt-get -f install -y >>"$AIB_INSTALL_STDOUT" 2>>"$AIB_INSTALL_STDERR" || true; ' +
    '  (' + c + ') >>"$AIB_INSTALL_STDOUT" 2>>"$AIB_INSTALL_STDERR"; ec=$?; ' +
    '  : >"$AIB_INSTALL_LOG"; cat "$AIB_INSTALL_STDOUT" >>"$AIB_INSTALL_LOG"; cat "$AIB_INSTALL_STDERR" >>"$AIB_INSTALL_LOG"; ' +
    'fi; ' +
    'if [ "$ec" != 0 ]; then ' +
    '  echo "[aib] APT_INSTALL_DIAGNOSTIC_BEGIN"; ' +
    '  echo "[aib] full apt install log preserved at $AIB_INSTALL_LOG"; ' +
    '  if [ -f "$AIB_INSTALL_LOG" ]; then cat "$AIB_INSTALL_LOG"; else echo "[aib] apt install log is unavailable: $AIB_INSTALL_LOG"; fi; ' +
    '  if [ -f "$AIB_INSTALL_STDERR" ]; then cat "$AIB_INSTALL_STDERR" >&2; fi; ' +
    '  echo "[aib] APT_INSTALL_DIAGNOSTIC_END"; ' +
    'else cat "$AIB_INSTALL_STDOUT"; cat "$AIB_INSTALL_STDERR" >&2; fi; ' +
    'echo "AIB_APT_EXIT:$ec"; ' +
    installPkgMarker +
    'exit "$ec"'
  );
}

/** Do not retry against unchanged Termux sources after an unrecognized failure. */
export function isPkgMirrorFailure(result: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}): boolean {
  const log = `${result.stdout || ""}\n${result.stderr || ""}`;
  if (/\[aib\] apt-get update failed|AIB_APT_UPDATE_EXIT:\d+/i.test(log)) return false;
  if (/Testing the available mirrors/i.test(log)) return true;
  if (result.exitCode === 100 && /Reading package lists/i.test(log)) return true;
  if (/Failed to fetch|404 Not Found|Could not resolve|Connection timed out/i.test(log)) return true;
  return false;
}
