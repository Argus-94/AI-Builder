/**
 * Unrestricted autonomous shell mode (v389).
 *
 * The agent is meant to finish build/create tasks on its own: install SDKs,
 * run sdkmanager, write scripts and gradle properties, delete and rebuild
 * caches, use curl/sudo/su-style helpers, pipes, command substitution, nested
 * shells. Earlier releases stopped it with a path whitelist, a "confirmable"
 * pattern list and a hard-block list. In this mode all of those gates are
 * off for the Termux/Ubuntu agent shell.
 *
 * Only a tiny floor stays, because no build, repair or install step can ever
 * need it and one wrong generation would destroy the whole device or the
 * user's entire shared storage: wiping the filesystem root, /data, or the
 * root of shared storage itself, formatting block devices, raw writes to disks,
 * fork bombs and power control. Flip the switch with setAgentUnrestrictedShell(false)
 * to restore the old strict guard.
 */
let unrestricted = true;
let floorEnabled = true;

/** false = no checks at all in unrestricted mode (even the catastrophic floor is off). */
export function setAgentCatastrophicFloor(value: boolean): void {
  floorEnabled = value === true;
}
export function isAgentCatastrophicFloorEnabled(): boolean {
  return floorEnabled;
}

export function isAgentUnrestrictedShell(): boolean {
  return unrestricted;
}

export function setAgentUnrestrictedShell(value: boolean): void {
  unrestricted = value === true;
}

const ROOT_TARGET =
  String.raw`(?:/|/\*|/data|/data/\*|/storage|/storage/\*|/storage/emulated|/storage/emulated/0/?|/storage/emulated/0/\*|/sdcard/?|/sdcard/\*|/system|/vendor)`;

const FLOOR: ReadonlyArray<{ re: RegExp; reason: string }> = [
  { re: new RegExp(String.raw`\brm\s+(?:-[A-Za-z-]+\s+)*(?:--\s+)?["']?${ROOT_TARGET}["']?(?=\s|$|[;&|)])`, "i"), reason: "wiping the filesystem or shared-storage root" },
  { re: /\bmkfs(?:\.\w+)?\b/i, reason: "formatting a block device" },
  { re: /\bdd\b[^\n;&|]*\bof=\/dev\/(?!null\b|zero\b|stdout\b|stderr\b)/i, reason: "raw write to a device node" },
  { re: />\s*\/dev\/(?:sd[a-z]|mmcblk|block\/|nvme)/i, reason: "redirect into a block device" },
  { re: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, reason: "fork bomb" },
  { re: /(?:^|[;&|]\s*|\n\s*)(?:shutdown|reboot|halt|poweroff)(?=\s|$|[;&|])/i, reason: "device power control" },
  { re: /\bfastboot\b/i, reason: "bootloader command" },
];

/** Returns the reason text when the command hits the catastrophic floor, else null. */
export function catastrophicCommandReason(command: string): string | null {
  if (!floorEnabled) return null;
  const text = String(command || "");
  for (const { re, reason } of FLOOR) {
    if (re.test(text)) return reason;
  }
  return null;
}
