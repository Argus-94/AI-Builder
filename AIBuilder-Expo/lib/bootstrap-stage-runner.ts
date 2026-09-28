/**
 * Default StageRunner for BootstrapPipeline — Termux shell probes/installs.
 */
import type { BootstrapStageId, StageRunner } from "../core/runtime/BootstrapPipeline";
import { runShellCommand } from "./termux-bridge";
import { isDebianInstalled } from "./debian-distro";

async function sh(
  cmd: string,
  timeoutMs = 120_000,
): Promise<{ ok: boolean; out: string }> {
  try {
    const r = await runShellCommand(cmd, { timeoutMs });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
    const code = r.exitCode ?? r.code ?? 1;
    return { ok: code === 0, out };
  } catch (e) {
    return { ok: false, out: e instanceof Error ? e.message : String(e) };
  }
}

export function createDefaultBootstrapRunner(): StageRunner {
  return async (stageId: BootstrapStageId, report) => {
    switch (stageId) {
      case "termux-ready": {
        report("Probe Termux shell…");
        const r = await sh("echo AIB_BOOTSTRAP_OK", 15_000);
        if (!r.ok || !r.out.includes("AIB_BOOTSTRAP_OK")) {
          return {
            ok: false,
            message: "Termux не отвечает (bridge / RUN_COMMAND / allow-external-apps)",
          };
        }
        return { ok: true, fingerprint: "termux:echo-ok", message: "Termux session OK" };
      }
      case "tools-base": {
        report("Checking base tools (java/unzip/git)…");
        const check = await sh(
          `ok=1
command -v unzip >/dev/null || ok=0
command -v git >/dev/null || ok=0
echo tools_ok=$ok
command -v java >/dev/null && java -version 2>&1 | head -1 || echo java=missing`,
          20_000,
        );
        if (check.out.includes("tools_ok=1") && !check.out.includes("java=missing")) {
          return { ok: true, fingerprint: "tools:java+unzip+git", message: "Base tools present" };
        }
        report("Installing openjdk-17 unzip git wget curl…");
        const inst = await sh(
          "set -o pipefail; pkg install -y openjdk-17 unzip git wget curl 2>&1 | tail -20; echo PKG_EXIT:$?",
          600_000,
        );
        const verify = await sh(
          "command -v java && command -v unzip && command -v git && echo TOOLS_OK",
          15_000,
        );
        if (!verify.out.includes("TOOLS_OK")) {
          return {
            ok: false,
            message: `tools-base failed: ${(inst.out + verify.out).slice(-400)}`,
          };
        }
        return { ok: true, fingerprint: "tools:java+unzip+git", message: "Base tools installed" };
      }
      case "proot-distro": {
        report("Checking proot-distro…");
        const has = await sh(
          "command -v proot-distro >/dev/null 2>&1; echo EXIT:$?",
          10_000,
        );
        if (/EXIT:0/.test(has.out)) {
          return { ok: true, fingerprint: "pkg:proot-distro", message: "proot-distro present" };
        }
        report("pkg update + install proot-distro…");
        // pipefail so pkg failure is not masked by tail; capture last lines for UI/log
        const inst = await sh(
          "set -o pipefail; pkg update -y 2>&1 | tail -5; " +
            "pkg install -y proot-distro 2>&1 | tee /tmp/aib-proot-install.log | tail -20; " +
            "echo PKG_EXIT:$?",
          600_000,
        );
        const v = await sh(
          "command -v proot-distro >/dev/null 2>&1; echo EXIT:$?",
          10_000,
        );
        if (/EXIT:0/.test(v.out)) {
          return { ok: true, fingerprint: "pkg:proot-distro", message: "proot-distro installed" };
        }
        const detail = (inst.out || "").slice(-500);
        const mirrorHint =
          /Testing the available mirrors|No mirror|not found|Unable to locate|503|404|Could not resolve/i.test(
            detail,
          )
            ? " Зеркала Termux недоступны: в Termux выполните termux-change-repo и повторите."
            : "";
        return {
          ok: false,
          message: `proot-distro install failed.${mirrorHint} ${detail}`.trim().slice(0, 600),
        };
      }
      case "debian-image": {
        report("Checking Debian image…");
        if (await isDebianInstalled()) {
          return {
            ok: true,
            fingerprint: "image:debian",
            message: "Debian already installed",
            skipped: false,
          };
        }
        report("proot-distro install debian (long)…");
        const inst = await sh(
          `proot-distro install debian 2>&1 | tail -40; echo EXIT:$?`,
          45 * 60_000,
        );
        if (await isDebianInstalled()) {
          return { ok: true, fingerprint: "image:debian", message: "Debian installed" };
        }
        return {
          ok: false,
          message: `Debian install failed: ${inst.out.slice(-500)}`,
        };
      }
      case "workspace": {
        report("Ensure workspace dirs…");
        const r = await sh(
          `mkdir -p "$HOME/workspace" "$HOME/exports" "$HOME/backups" 2>/dev/null
[ -d "$HOME/workspace" ] && echo WS_OK || echo WS_FAIL`,
          15_000,
        );
        if (!r.out.includes("WS_OK")) {
          return { ok: false, message: "workspace dirs failed" };
        }
        return { ok: true, fingerprint: "dirs:workspace+exports", message: "Workspace ready" };
      }
      case "verify": {
        report("Final verify…");
        const r = await sh(
          `echo AIB_VERIFY_OK
command -v proot-distro >/dev/null && proot-distro list 2>/dev/null | head -5 || true`,
          20_000,
        );
        if (!r.out.includes("AIB_VERIFY_OK")) {
          return { ok: false, message: "verify probe failed" };
        }
        return { ok: true, fingerprint: "verify:ok", message: "Bootstrap verify OK" };
      }
      default:
        return { ok: false, message: `Unknown stage ${stageId}` };
    }
  };
}
