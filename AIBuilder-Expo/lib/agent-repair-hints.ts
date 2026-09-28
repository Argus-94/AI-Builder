/**
 * Map live [ENV] / health probes to DeterministicRepair recipe hints.
 * Injected into agent transcript so the model picks fixed recipes, not invented shell.
 */
import { createDeterministicRepair, type RepairRecipe } from "../core/recovery/DeterministicRepair";

const repair = createDeterministicRepair();

export type EnvRepairHint = Readonly<{
  code: string;
  recipe: RepairRecipe;
  envLine: string;
}>;

/** Parse lines like gradle=BROKEN:... or java=MISSING */
export function collectEnvRepairHints(envSnapshot: string): EnvRepairHint[] {
  const hints: EnvRepairHint[] = [];
  const lines = (envSnapshot || "").split("\n");
  for (const line of lines) {
    const s = line.trim();
    if (/^gradle=(BROKEN|MISSING)/i.test(s)) {
      const recipe = repair.get("gradle-pkg") || repair.get("gradle-wrapper");
      if (recipe) hints.push({ code: "toolchain.gradle", recipe, envLine: s });
    } else if (/^java=(BROKEN|MISSING)/i.test(s)) {
      const recipe = repair.get("java-install");
      if (recipe) hints.push({ code: "toolchain.java", recipe, envLine: s });
    } else if (/^node=(BROKEN|MISSING)/i.test(s)) {
      const recipe = repair.get("nodejs");
      if (recipe) hints.push({ code: "toolchain.node", recipe, envLine: s });
    } else if (/^sdk_dir=MISSING/i.test(s)) {
      const recipe = repair.get("local-properties");
      if (recipe) hints.push({ code: "toolchain.android-sdk", recipe, envLine: s });
    } else if (/^aapt2=MISSING/i.test(s) || /^zipalign=MISSING/i.test(s)) {
      const recipe = repair.get("local-properties");
      if (recipe) hints.push({ code: "toolchain.android-sdk", recipe, envLine: s });
    } else if (/^git=(BROKEN|MISSING)/i.test(s) || /\bgit: not found\b/i.test(s)) {
      const recipe = repair.get("git");
      if (recipe) hints.push({ code: "toolchain.git", recipe, envLine: s });
    } else if (/^unzip=(BROKEN|MISSING)/i.test(s) || /\bunzip: not found\b/i.test(s)) {
      const recipe = repair.get("unzip");
      if (recipe) hints.push({ code: "toolchain.unzip", recipe, envLine: s });
    } else if (/^adb=(BROKEN|MISSING)/i.test(s)) {
      const recipe = repair.get("android-tools");
      if (recipe) hints.push({ code: "device.adb", recipe, envLine: s });
    } else if (/^proot-distro=(BROKEN|MISSING)/i.test(s) || /proot-distro.*not found/i.test(s)) {
      const recipe = repair.get("proot-distro-pkg");
      if (recipe) hints.push({ code: "runtime.proot", recipe, envLine: s });
    }
  }
  const seen = new Set<string>();
  return hints.filter((h) => {
    if (seen.has(h.recipe.id)) return false;
    seen.add(h.recipe.id);
    return true;
  });
}

/** From RuntimeHealth rows (id + level + message). */
export function collectHealthRepairHints(
  rows: Array<{ id: string; level: string; message?: string }>,
): EnvRepairHint[] {
  const hints: EnvRepairHint[] = [];
  for (const row of rows || []) {
    if (row.level !== "error" && row.level !== "warn") continue;
    const recipe = repair.forDiagnostic(row.id);
    if (!recipe) continue;
    hints.push({
      code: row.id,
      recipe,
      envLine: `${row.id}=${row.level}:${(row.message || "").slice(0, 80)}`,
    });
  }
  const seen = new Set<string>();
  return hints.filter((h) => {
    if (seen.has(h.recipe.id)) return false;
    seen.add(h.recipe.id);
    return true;
  });
}

export function formatRepairHintsBlock(hints: EnvRepairHint[]): string {
  if (!hints.length) return "";
  const lines = [
    "\n\n[DETERMINISTIC_REPAIR] Tools flagged MISSING/BROKEN. Use ONLY these recipes (do not invent shell):",
  ];
  for (const h of hints) {
    lines.push(
      `- ${h.code} (${h.envLine}) → recipe=${h.recipe.id} risk=${h.recipe.risk}`,
      `  hint: ${h.recipe.termuxHint}`,
      `  title: ${h.recipe.title}`,
    );
  }
  lines.push(
    "Reply with EXACTLY one of:",
  );
  for (const h of hints) {
    const shell = (h.recipe.termuxHint || "").startsWith("AIB_INTERNAL:")
      ? `echo recipe ${h.recipe.id}`
      : h.recipe.termuxHint;
    lines.push(`  TERMUX_RUN:\n${shell}`);
  }
  lines.push(
    "Do NOT paste recipe=id or 'risk=medium' as the command — that is not bash.",
    "Never invent destructive shell. After install, re-probe ENV until OK.",
  );
  return lines.join("\n");
}

/** Soft postscript for protocol abort (model ignored TERMUX_RUN). */
export function formatProtocolAbortHint(language: "ru" | "uk" | "en" = "ru"): string {
  const m = {
    ru: "\n→ Настройки: смените модель на более сильную (не free nano), сократите задачу, Termux ON.",
    uk: "\n→ Налаштування: сильніша модель, коротше завдання, Termux ON.",
    en: "\n→ Settings: switch to a stronger model (not free nano), shorten the task, Termux ON.",
  };
  return m[language] || m.en;
}
