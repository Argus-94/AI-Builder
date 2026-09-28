/**
 * Whitelist путей и опасных команд для Termux-агента.
 * Опасные операции требуют allowDangerous=true или UI confirm (confirmable).
 * По умолчанию dangerous mode выключен (caller не должен передавать allowDangerous).
 */

const SAFE_ROOTS = [
  "/data/data/com.termux/files/home",
  "$HOME",
  "~",
  "/storage/emulated/0",
  "/sdcard",
  "$PREFIX",
];

/** Жёсткий блок — не confirmable, только allowDangerous. */
const HARD_BLOCK_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\brm\s+(-[a-zA-Z]*f[a-zA-Z]*\s+)?\/\s*$/i, reason: "Refusing rm on filesystem root" },
  { re: /\brm\s+(-[rf]+\s+)+\/(?!data\/data\/com\.termux|storage|sdcard|home|tmp|var\/tmp)/i, reason: "Refusing rm -rf outside allowed roots" },
  { re: /\bmkfs\b/i, reason: "Blocked mkfs" },
  { re: /\bdd\s+.*\bof=\/dev\//i, reason: "Blocked dd to device" },
  { re: /\bdd\s+if=/i, reason: "Blocked dd if=" },
  { re: /\b:\(\)\s*\{\s*:\|:\s*&\s*\}\s*;/i, reason: "Blocked fork bomb" },
  { re: /\bchmod\s+-R\s+777\s+\//i, reason: "Blocked chmod -R 777 /" },
  { re: /\bcd\s+(?:["\']?[^;&|\n]*\/)?\.\.(?:\/|["\']?(?:\s|$))/i, reason: "Blocked directory traversal via cd" },
  { re: />\s*\/dev\/sd[a-z]/i, reason: "Blocked write to block device" },
  { re: /\b(shutdown|reboot|halt|poweroff)\b/i, reason: "Blocked power control command" },
];

/** Confirmable — можно разрешить через UI. */
const CONFIRMABLE_PATTERNS: Array<{ re: RegExp; reason: string }> = [
  { re: /\bcurl\b[\s\S]{0,200}\|\s*(ba)?sh\b/i, reason: "curl piped to shell" },
  { re: /\bwget\b[\s\S]{0,200}\|\s*(ba)?sh\b/i, reason: "wget piped to shell" },
  { re: /\b(curl|wget)\b[\s\S]{0,120}\|\s*(ba)?sh\b/i, reason: "download piped to shell" },
  { re: /\bbase64\b[\s\S]{0,80}\|\s*(ba)?sh\b/i, reason: "base64 piped to shell" },
  { re: /\bpython(?:3)?\s+-c\b/i, reason: "python -c inline code" },
  { re: /\bperl\s+-e\b/i, reason: "perl -e inline code" },
  { re: /\bnode\s+-e\b/i, reason: "node -e inline code" },
  { re: /\bphp\s+-r\b/i, reason: "php -r inline code" },
  { re: /\bruby\s+-e\b/i, reason: "ruby -e inline code" },
  { re: /\$\([^)]+\)/, reason: "command substitution $()" },
  { re: /`[^`]+`/, reason: "backtick command substitution" },
  { re: /\bchmod\s+-R\s+777\b/i, reason: "chmod -R 777" },
  { re: /\bchown\s+-R\b/i, reason: "chown -R" },
  { re: /\bsudo\b/i, reason: "sudo" },
  { re: /\bsu\s+-/i, reason: "su -" },
  { re: /(?:^|[;|&]\s*)su(?:\s|$)/i, reason: "su (privilege escalation)" },
  { re: /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f[a-zA-Z]*|-[a-zA-Z]*f[a-zA-Z]*r[a-zA-Z]*|--recursive)\b/i, reason: "rm -rf (destructive delete)" },
  { re: /\bapktool\s+b\b/i, reason: "apktool rebuild (APK repack)" },
  { re: /\b(apktool|aapt|aapt2)\b[\s\S]{0,80}\b(package|build)\b/i, reason: "APK repack/package" },
  { re: /\b(jarsigner|apksigner)\b/i, reason: "APK signing" },
  { re: /\bnc\s+-[el]/i, reason: "netcat listen/exec" },
  { re: /\bncat\b.*\s-e\b/i, reason: "ncat -e" },
  { re: /\bbusybox\s+nc\b/i, reason: "busybox nc" },
  { re: /\biptables\b/i, reason: "iptables" },
  { re: /\bmount\b/i, reason: "mount" },
  { re: /\bumount\b/i, reason: "umount" },
  { re: /\bexport\s+(PATH|LD_PRELOAD|LD_LIBRARY_PATH)=/i, reason: "sensitive env override" },
];

function isPathWithinRoot(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}/`);
}

function isPathAllowed(target: string, projectPath?: string | null): boolean {
  const t = target.replace(/^["']|["']$/g, "");
  // Default sandbox: AIBuilderTermux + $HOME/aibuilder-* + Termux home/prefix + tmp
  const roots = [
    "~",
    "$HOME",
    "$PREFIX",
    "/data/data/com.termux",
    "/storage/emulated/0/AIBuilderTermux",
    "/storage/emulated/0/Download",
    "/sdcard/AIBuilderTermux",
    "/sdcard/Download",
    "/tmp",
    "/var/tmp",
  ];
  if (roots.some((root) => isPathWithinRoot(t, root))) return true;
  // Explicit aibuilder-* under home / storage
  if (/\/(?:aibuilder[-_]|AIBuilder)/i.test(t)) return true;
  if (projectPath && isPathWithinRoot(t, projectPath.replace(/\/$/, ""))) return true;
  return false;
}

export type GuardResult =
  | { ok: true }
  | { ok: false; reason: string; confirmable?: boolean };

export function guardTermuxCommand(
  command: string,
  opts?: { allowDangerous?: boolean; projectPath?: string | null }
): GuardResult {
  const cmd = command.trim();
  if (!cmd) return { ok: false, reason: "empty command" };

  // Explicit opt-in only. Default path never auto-allows hard blocks.
  if (opts?.allowDangerous === true) return { ok: true };

  for (const { re, reason } of HARD_BLOCK_PATTERNS) {
    if (re.test(cmd)) {
      return { ok: false, reason: `Blocked: ${reason}` };
    }
  }

  for (const { re, reason } of CONFIRMABLE_PATTERNS) {
    if (re.test(cmd)) {
      return {
        ok: false,
        reason: `Needs confirmation: ${reason}`,
        confirmable: true,
      };
    }
  }

  // Regression examples: `cp safe /etc/passwd`, `mv safe /etc/x`, and
  // `ln safe /etc/x` must all be rejected when the destination is outside the
  // whitelist, even though the first operand is relative/safe.
  // rm / mv / cp / chmod / chown / ln: validate EVERY absolute path operand,
  // not only the first one. A command such as `cp safe /etc/passwd` must not
  // pass merely because its first operand is inside an allowed root.
  const pathOps = cmd.matchAll(/\b(rm|mv|cp|chmod|chown|ln)\s+([^;&|\n]+)/gi);
  for (const m of pathOps) {
    const operands = m[2] || "";
    if (/(?:^|[\/\s"'])\.\.(?:[\/\s"']|$)/.test(operands)) {
      return { ok: false, reason: "Path traversal is not allowed in filesystem operation" };
    }
    const absolutePaths = operands.match(/(?:^|[\s"\'])\/(?:[^\s;&|"\']*)/g) || [];
    for (const raw of absolutePaths) {
      const target = raw.trim().replace(/^["']|["']$/g, "");
      if (!target) continue;
      if (target === "/" || target === "/*") {
        return { ok: false, reason: "Refusing to touch filesystem root" };
      }
      if (!isPathAllowed(target, opts?.projectPath)) {
        return {
          ok: false,
          reason: `Path not in whitelist: ${target}`,
          confirmable: true,
        };
      }
    }
  }

  return { ok: true };
}



/**
 * Strict policy for read-only subagents.
 * This is intentionally separate from the general command guard: a read-only
 * worker must not be able to turn a confirmation prompt into write/network/
 * process execution. Shell metacharacters and path traversal are rejected
 * rather than parsed heuristically.
 */
const READ_ONLY_COMMANDS = new Set([
  "pwd", "ls", "find", "cat", "head", "tail", "sed", "grep", "rg",
  "sort", "uniq", "wc", "cut", "tr", "diff", "cmp", "file", "stat",
  "sha256sum", "realpath", "readlink", "basename", "dirname", "git",
  "which", "type", "printf",
]);
const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  "status", "diff", "log", "show", "ls-files", "rev-parse", "branch",
  "describe", "cat-file",
]);

function hasShellMutationOrEscapeSyntax(command: string): string | null {
  if (/[;&|<>]/.test(command)) return "shell control/redirection syntax is not allowed";
  if (/[`]/.test(command) || /\$\s*\(/.test(command)) return "command substitution is not allowed";
  if (/\b(?:eval|exec|source|\.\s|alias|unalias|function)\b/i.test(command)) return "shell metaprogramming is not allowed";
  if (/(^|[\s'\"])(?:\.\.)(?:[\/\s'\"]|$)/.test(command) || /(?:^|[\/])\.\.(?:[\/]|$)/.test(command)) {
    return "path traversal is not allowed";
  }
  return null;
}

function shellWordsForReadOnly(command: string): string[] | null {
  // Deliberately conservative tokenizer: quoted strings are retained as one
  // token; malformed quoting fails closed.
  const words: string[] = [];
  let current = "";
  let quote = "";
  let escaped = false;
  for (const ch of command.trim()) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === "\\" && quote !== "'") { escaped = true; continue; }
    if (quote) { if (ch === quote) quote = ""; else current += ch; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (/\s/.test(ch)) { if (current) { words.push(current); current = ""; } continue; }
    current += ch;
  }
  if (escaped || quote) return null;
  if (current) words.push(current);
  return words;
}

export function guardReadOnlyTermuxCommand(command: string): GuardResult {
  const cmd = command.trim();
  if (!cmd) return { ok: false, reason: "empty command" };
  const syntaxReason = hasShellMutationOrEscapeSyntax(cmd);
  if (syntaxReason) return { ok: false, reason: `Read-only blocked: ${syntaxReason}` };
  const words = shellWordsForReadOnly(cmd);
  if (!words?.length) return { ok: false, reason: "Read-only blocked: malformed shell quoting" };

  if (words[0].includes("/")) return { ok: false, reason: "Read-only blocked: executable paths are not allowed" };
  const executable = words[0];
  if (!READ_ONLY_COMMANDS.has(executable)) {
    return { ok: false, reason: `Read-only blocked: command '${executable}' is not allowlisted` };
  }
  if (executable === "git") {
    const sub = words[1];
    if (!sub || !READ_ONLY_GIT_SUBCOMMANDS.has(sub) || words.includes("-C") || words.includes("--git-dir") || words.includes("--work-tree") || words.includes("-c") || words.includes("--ext-diff")) {
      return { ok: false, reason: "Read-only blocked: git operation is not allowlisted" };
    }
  }

  // No explicit absolute filesystem target is accepted. Subagents should use
  // their supplied project workdir and the AIB_TOOL for structured access.
  for (const word of words.slice(1)) {
    if (word === "-i" || word.startsWith("--in-place") || word === "-delete" || /^-(?:exec|execdir|ok|okdir)(?:$|=)/.test(word) || word === "-o" || word === "--output") {
      return { ok: false, reason: "Read-only blocked: mutating option is not allowed" };
    }
    if (word.startsWith("/") || word.startsWith("~") || word.startsWith("$")) {
      return { ok: false, reason: "Read-only blocked: absolute/home/environment paths are not allowed" };
    }
  }
  return { ok: true };
}

export function getPreferredProjectRoot(): string {
  return "/storage/emulated/0/AIBuilderTermux";
}

export { SAFE_ROOTS, HARD_BLOCK_PATTERNS, CONFIRMABLE_PATTERNS };
