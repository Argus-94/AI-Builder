/**
 * AI Builder device-command security policy (inspired by DSHA ideas, written for AIB).
 * Always-on allowlist for elevated / shell entry points — not a kernel sandbox.
 */
import { persistentLogger } from "./persistent-logger";

export type ExecChannel = "termux" | "shizuku" | "adb" | "plugin";

export type PolicyVerdict = {
  ok: boolean;
  reason?: string;
  normalized?: string;
};

/** High-risk path prefixes — never allow as write targets via policy-checked exec. */
export const FORBIDDEN_PATH_PREFIXES = [
  "/system",
  "/vendor",
  "/proc",
  "/sys",
  "/data/data/", // other apps; our own package is handled separately
  "/data/user/",
] as const;

/** Command name allowlist (first token after env vars). Empty = deny unknown for elevated channels. */
const ELEVATED_COMMAND_ALLOW = new Set([
  "echo",
  "true",
  "false",
  "ls",
  "pwd",
  "cat",
  "head",
  "tail",
  "wc",
  "test",
  "mkdir",
  "cp",
  "mv",
  "rm",
  "chmod",
  "stat",
  "find",
  "grep",
  "sed",
  "awk",
  "tar",
  "gzip",
  "curl",
  "wget",
  "node",
  "npm",
  "pnpm",
  "python",
  "python3",
  "java",
  "javac",
  "gradle",
  "gradlew",
  "pkill",
  "kill",
  "adb",
  "sdkmanager",
  "pkg",
  "apt",
  "apt-get",
  "proot-distro",
  "proot",
  "bash",
  "sh",
  "uname",
  "id",
  "whoami",
  "df",
  "du",
  "which",
  "command",
  "rish",
  "git",
  "zip",
  "unzip",
  "aapt",
  "aapt2",
  "d8",
  "zipalign",
  "apksigner",
  "kotlinc",
  "keytool",
]);

const FORBIDDEN_SUBSTRINGS = [
  "mkfs",
  "dd if=",
  ":(){",
  "rm -rf /",
  "rm -rf /*",
  "chmod -R 777 /",
  "> /dev/sd",
  "reboot",
  "fastboot",
  "recovery",
];

function firstCommandToken(cmd: string): string {
  const s = cmd.trim().replace(/^(\w+=\S+\s+)+/, "");
  const m = s.match(/^([a-zA-Z0-9_./+-]+)/);
  return m ? m[1].split("/").pop() || m[1] : "";
}

/**
 * Policy check before elevated or agent-driven shell.
 * channel "termux" interactive user input is more permissive (only blocks forbidden patterns).
 */
export function evaluateCommandPolicy(
  command: string,
  channel: ExecChannel,
  opts?: { interactive?: boolean },
): PolicyVerdict {
  const raw = String(command || "").trim();
  if (!raw) return { ok: false, reason: "empty command" };

  const lower = raw.toLowerCase();
  for (const bad of FORBIDDEN_SUBSTRINGS) {
    if (lower.includes(bad.toLowerCase())) {
      return { ok: false, reason: `forbidden pattern: ${bad}` };
    }
  }

  // Path probes in write-like forms.
  // Termux PREFIX lives under /data/data/com.termux/ — never treat that as "other app".
  // Deny only when a write targets a non-Termux /data/data/<other> path.
  if (/\b(rm|mv|chmod|chown)\b/i.test(raw)) {
    const hasTermuxData = /\/data\/data\/com\.termux\b/i.test(raw);
    const hasOtherAppData =
      /\/data\/data\/(?!com\.termux\b)[\w.]+/i.test(raw) ||
      (/\/data\/data\//i.test(raw) && !hasTermuxData && !/\$PREFIX\b|\$HOME\b/.test(raw));
    if (hasOtherAppData && !/aibuilder|com\.anonymous/i.test(raw)) {
      return { ok: false, reason: "forbidden path scope: /data/data/ (non-Termux)" };
    }
    if (/\/(system|vendor)\b/i.test(raw) && /\b(rm|mv|chmod|chown)\b/i.test(raw)) {
      if (!hasTermuxData) {
        return { ok: false, reason: "forbidden path scope: /system or /vendor" };
      }
    }
  }

  if (channel === "termux" && opts?.interactive) {
    return { ok: true, normalized: raw };
  }

  if (channel === "shizuku" || channel === "adb" || channel === "plugin") {
    const tok = firstCommandToken(raw);
    if (!tok || !ELEVATED_COMMAND_ALLOW.has(tok)) {
      return { ok: false, reason: `command not allowlisted for ${channel}: ${tok || "?"}` };
    }
  }

  // Agent termux (non-interactive): still block forbidden; prefer known tools
  if (channel === "termux" && !opts?.interactive) {
    const tok = firstCommandToken(raw);
    // pipelines / compound — allow but log
    if (tok && !ELEVATED_COMMAND_ALLOW.has(tok) && !raw.includes("|") && !raw.startsWith("cd ")) {
      persistentLogger.add("debug", "Policy", `termux agent uncommon cmd: ${tok}`);
    }
  }

  return { ok: true, normalized: raw };
}

export function assertCommandAllowed(
  command: string,
  channel: ExecChannel,
  opts?: { interactive?: boolean },
): string {
  const v = evaluateCommandPolicy(command, channel, opts);
  if (!v.ok) {
    persistentLogger.add("warn", "Policy", `deny ${channel}: ${v.reason}`);
    throw new Error(`SECURITY_POLICY_DENIED: ${v.reason}`);
  }
  return v.normalized || command;
}

export type SecurityPolicySummary = {
  elevatedAllowCount: number;
  forbiddenPathCount: number;
  channels: ExecChannel[];
};

export function getSecurityPolicySummary(): SecurityPolicySummary {
  return {
    elevatedAllowCount: ELEVATED_COMMAND_ALLOW.size,
    forbiddenPathCount: FORBIDDEN_PATH_PREFIXES.length,
    channels: ["termux", "shizuku", "adb", "plugin"],
  };
}
