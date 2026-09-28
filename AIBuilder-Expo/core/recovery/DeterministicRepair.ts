/**
 * DeterministicRepair — maps failure codes to fixed repair recipes.
 * LLM may choose a code; it must never generate arbitrary shell for repair.
 */
export type RepairRecipe = Readonly<{
  id: string;
  title: string;
  description: string;
  /** Hint for Script Runner / Termux — not executed automatically without allowlist */
  termuxHint: string;
  risk: "low" | "medium" | "high";
}>;

const RECIPES: RepairRecipe[] = [
  {
    id: "gradle-wrapper",
    title: "Restore Gradle Wrapper",
    description: "Re-create gradlew scripts and wrapper properties from a known-good template",
    termuxHint: "test -f gradlew || echo NEED_WRAPPER_TEMPLATE",
    risk: "low",
  },
  {
    id: "gradle-cache",
    title: "Clear Gradle cache",
    description: "Remove corrupted Gradle caches under GRADLE_USER_HOME",
    termuxHint: "rm -rf \"$HOME/.aibuilder-gradle/caches\" 2>/dev/null; echo GRADLE_CACHE_CLEARED",
    risk: "medium",
  },
  {
    id: "local-properties",
    title: "Fix local.properties",
    description: "Rewrite sdk.dir to Termux Android SDK path",
    termuxHint: "echo \"sdk.dir=$PREFIX/opt/android-sdk\" > local.properties",
    risk: "low",
  },
  {
    id: "java-install",
    title: "Install OpenJDK",
    description: "Install OpenJDK via Termux packages",
    termuxHint: "pkg install -y openjdk-17",
    risk: "medium",
  },
  {
    id: "gradle-pkg",
    title: "Install Gradle package",
    description: "Install Termux gradle package (may still need wrapper)",
    termuxHint: "pkg install -y gradle",
    risk: "medium",
  },
  {
    id: "android-tools",
    title: "Install android-tools (adb)",
    description: "Install adb/fastboot from Termux",
    termuxHint: "pkg install -y android-tools",
    risk: "low",
  },
  {
    id: "nodejs",
    title: "Install Node.js",
    description: "Install Node.js in Termux",
    termuxHint: "pkg install -y nodejs",
    risk: "low",
  },
  {
    id: "proot-distro-pkg",
    title: "Install proot-distro",
    description: "Install proot-distro package for Debian userspace",
    termuxHint: "pkg install -y proot-distro",
    risk: "low",
  },
  {
    id: "unzip",
    title: "Install unzip",
    description: "Install unzip for archives and SDK components",
    termuxHint: "pkg install -y unzip",
    risk: "low",
  },
  {
    id: "git",
    title: "Install git",
    description: "Install git in Termux",
    termuxHint: "pkg install -y git",
    risk: "low",
  },
  {
    id: "wget-curl",
    title: "Install wget/curl",
    description: "Network tools for downloads",
    termuxHint: "pkg install -y wget curl",
    risk: "low",
  },
  {
    id: "journal-recovery",
    title: "Recover pending journal",
    description: "Mark crashed maintenance transactions as rolled_back",
    termuxHint: "AIB_INTERNAL:journal-recover",
    risk: "low",
  },
  {
    id: "home-layout",
    title: "Ensure HOME layout",
    description: "Create durable AI Builder directories under HOME",
    termuxHint: "mkdir -p \"$HOME/.aibuilder\" \"$HOME/AIBuilderTermux\" \"$HOME/projects\" && echo REPAIR_OK:home-layout",
    risk: "low",
  },
  {
    id: "ndk-path",
    title: "Check NDK path",
    description: "Verify aarch64 NDK under PREFIX/opt/android-ndk",
    termuxHint: "test -d \"$PREFIX/opt/android-ndk\" && echo REPAIR_OK:ndk || echo NDK_MISSING",
    risk: "low",
  },
  {
    id: "aapt2-sdk",
    title: "Locate aapt2",
    description: "Find aapt2 in SDK build-tools",
    termuxHint: "command -v aapt2 || find \"$PREFIX/opt/android-sdk/build-tools\" -name aapt2 2>/dev/null | head -1; echo REPAIR_OK:aapt2",
    risk: "low",
  },
  {
    id: "adb-server",
    title: "Restart adb server",
    description: "Kill and start adb server",
    termuxHint: "adb kill-server 2>/dev/null; adb start-server && echo REPAIR_OK:adb-server",
    risk: "low",
  },
];

export class DeterministicRepair {
  private readonly byId = new Map(RECIPES.map((r) => [r.id, r]));

  list(): RepairRecipe[] {
    return [...RECIPES];
  }

  get(id: string): RepairRecipe | undefined {
    return this.byId.get(id);
  }

  /** Map diagnostic rule id → preferred recipe */
  forDiagnostic(diagnosticId: string): RepairRecipe | undefined {
    const map: Record<string, string> = {
      "toolchain.gradle": "gradle-pkg",
      "toolchain.java": "java-install",
      "toolchain.android-sdk": "local-properties",
      "toolchain.node": "nodejs",
      "toolchain.git": "git",
      "toolchain.unzip": "unzip",
      "device.adb": "android-tools",
      "runtime.journal-pending": "journal-recovery",
      "runtime.proot": "proot-distro-pkg",
      "runtime.userspace": "proot-distro-pkg",
      "runtime.debian": "proot-distro-pkg",
      "runtime.termux-session": "journal-recovery",
      "runtime.home-layout": "home-layout",
      "toolchain.ndk": "ndk-path",
      "toolchain.aapt2": "aapt2-sdk",
    };
    const rid = map[diagnosticId];
    return rid ? this.byId.get(rid) : undefined;
  }

  /** Safe: only returns recipe metadata, never executes */
  plan(id: string): { ok: true; recipe: RepairRecipe } | { ok: false; error: string } {
    const recipe = this.byId.get(id);
    if (!recipe) return { ok: false, error: `Unknown recipe: ${id}` };
    return { ok: true, recipe };
  }
}

export function createDeterministicRepair(): DeterministicRepair {
  return new DeterministicRepair();
}
