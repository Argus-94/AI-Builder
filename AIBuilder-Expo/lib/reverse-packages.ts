/**
 * Пакеты для реверс-инжиниринга APK в Termux.
 * Структура зеркалит compile-packages.ts — те же install/check/remove.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { runShellCommand, type TermuxCommandResult } from "./termux-bridge";
import { persistentLogger } from "./persistent-logger";
import { withInstallerEnvironment, withCheckEnvironment } from "./termux-installer-env";

export type ReversePkgId =
  | "smali"
  | "radare2"
  | "aapt"
  | "aapt2"
  | "zipalign"
  | "apksigner"
  | "openssl"
  | "binutils"
  | "strace"
  | "ltrace"
  | "gdb"
  | "android-tools"
  | "frida-tools"
  | "androguard"
  | "apkleaks"
  | "jadx"
  | "objection"
  | "mitmproxy"
  | "capstone";

export interface ReversePackageDef {
  id: ReversePkgId;
  name: string;
  nameEn: string;
  installCmd: string;
  checkCmd: string;
  removeCmd: string;
  estimateSec: number;
  order: number;
  /** true = установка намеренно отключена (нет pin SHA / pip). UI не должен показывать «Установить» как рабочее. */
  blocked?: boolean;
  blockedReason?: string;
}

export const REVERSE_PACKAGES: ReversePackageDef[] = [
  {
    id: "openssl",
    name: "OpenSSL",
    nameEn: "OpenSSL",
    installCmd: `set +e
pkg install -y openssl openssl-tool 2>&1
if command -v openssl >/dev/null 2>&1; then
  openssl version 2>&1 | head -1
  echo OPENSSL_OK
  exit 0
fi
# уже может быть как зависимость curl
if [ -x "$PREFIX/bin/openssl" ]; then
  echo OPENSSL_OK
  exit 0
fi
echo OPENSSL_FAIL
exit 1`,
    checkCmd: 'command -v openssl >/dev/null 2>&1 || [ -x "$PREFIX/bin/openssl" ]',
    removeCmd: "pkg uninstall -y openssl openssl-tool 2>/dev/null; true",
    estimateSec: 25,
    order: 1,
  },
  {
    id: "binutils",
    name: "Binutils (objdump/readelf)",
    nameEn: "Binutils (objdump/readelf)",
    installCmd: "pkg install -y binutils",
    checkCmd: "command -v objdump >/dev/null 2>&1 && command -v readelf >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y binutils",
    estimateSec: 40,
    order: 2,
  },
  {
    id: "android-tools",
    name: "Android Tools (adb)",
    nameEn: "Android Tools (adb)",
    installCmd: "pkg install -y android-tools",
    checkCmd: "command -v adb >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y android-tools",
    estimateSec: 40,
    order: 3,
  },
  {
    id: "aapt",
    name: "AAPT",
    nameEn: "AAPT",
    installCmd: "pkg install -y aapt",
    checkCmd: "command -v aapt >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y aapt",
    estimateSec: 25,
    order: 4,
  },
  {
    id: "aapt2",
    name: "AAPT2",
    nameEn: "AAPT2",
    installCmd: "pkg install -y aapt2",
    checkCmd: "command -v aapt2 >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y aapt2",
    estimateSec: 25,
    order: 5,
  },
  {
    id: "zipalign",
    name: "Zipalign",
    nameEn: "Zipalign",
    installCmd: "pkg install -y zipalign",
    checkCmd: "command -v zipalign >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y zipalign",
    estimateSec: 15,
    order: 6,
  },
  {
    id: "apksigner",
    name: "Apksigner",
    nameEn: "Apksigner",
    installCmd: "pkg install -y apksigner",
    checkCmd: "command -v apksigner >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y apksigner",
    estimateSec: 20,
    order: 7,
  },
  {
    id: "smali",
    name: "Smali / Baksmali",
    nameEn: "Smali / Baksmali",
    installCmd: `set +e
pkg install -y openjdk-17 openjdk-21 wget curl 2>&1 | tail -3
PREFIX="\${PREFIX:-/data/data/com.termux/files/usr}"
mkdir -p "$PREFIX/opt/smali" "$PREFIX/bin"
if command -v smali >/dev/null 2>&1 && command -v baksmali >/dev/null 2>&1; then
  smali --version 2>&1 | head -1
  echo SMALI_OK
  exit 0
fi
cd "$PREFIX/opt/smali" || exit 1
rm -f smali.jar baksmali.jar
curl -fL --connect-timeout 20 --retry 3 --max-time 300 -o smali.jar \
  "https://github.com/baksmali/smali/releases/download/3.0.10/smali-3.0.10-fat.jar" \
  || wget -c -O smali.jar "https://github.com/baksmali/smali/releases/download/3.0.10/smali-3.0.10-fat.jar"
curl -fL --connect-timeout 20 --retry 3 --max-time 300 -o baksmali.jar \
  "https://github.com/baksmali/smali/releases/download/3.0.10/baksmali-3.0.10-fat.jar" \
  || wget -c -O baksmali.jar "https://github.com/baksmali/smali/releases/download/3.0.10/baksmali-3.0.10-fat.jar"
SZ1=$(stat -c%s smali.jar 2>/dev/null || echo 0)
SZ2=$(stat -c%s baksmali.jar 2>/dev/null || echo 0)
echo "SMALI_SIZE $SZ1 $SZ2"
if [ "$SZ1" -lt 1000000 ] || [ "$SZ2" -lt 1000000 ]; then
  curl -fL --max-time 300 -o smali.jar "https://ghfast.top/https://github.com/baksmali/smali/releases/download/3.0.10/smali-3.0.10-fat.jar" || true
  curl -fL --max-time 300 -o baksmali.jar "https://ghfast.top/https://github.com/baksmali/smali/releases/download/3.0.10/baksmali-3.0.10-fat.jar" || true
  SZ1=$(stat -c%s smali.jar 2>/dev/null || echo 0)
  SZ2=$(stat -c%s baksmali.jar 2>/dev/null || echo 0)
fi
if [ "$SZ1" -lt 1000000 ] || [ "$SZ2" -lt 1000000 ]; then
  echo SMALI_FAIL
  exit 1
fi
printf '%s\n' '#!/data/data/com.termux/files/usr/bin/sh' \
  'exec java -jar /data/data/com.termux/files/usr/opt/smali/smali.jar "$@"' \
  > "$PREFIX/bin/smali"
printf '%s\n' '#!/data/data/com.termux/files/usr/bin/sh' \
  'exec java -jar /data/data/com.termux/files/usr/opt/smali/baksmali.jar "$@"' \
  > "$PREFIX/bin/baksmali"
chmod +x "$PREFIX/bin/smali" "$PREFIX/bin/baksmali"
chmod 644 smali.jar baksmali.jar
smali --version 2>&1 | head -2
echo SMALI_OK
exit 0`,
    checkCmd: "command -v smali >/dev/null 2>&1 || command -v baksmali >/dev/null 2>&1",
    removeCmd: `rm -f "$PREFIX/bin/smali" "$PREFIX/bin/baksmali"; rm -rf "$PREFIX/opt/smali"`,
    estimateSec: 90,
    order: 9,
  },
  {
    id: "jadx",
    name: "JADX",
    nameEn: "JADX",
    installCmd: "pkg install -y jadx",
    checkCmd: "command -v jadx >/dev/null 2>&1 || command -v jadx-cli >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y jadx",
    estimateSec: 50,
    order: 10,
  },
  {
    id: "radare2",
    name: "Radare2",
    nameEn: "Radare2",
    installCmd: "pkg install -y radare2",
    checkCmd: "command -v r2 >/dev/null 2>&1 || command -v radare2 >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y radare2",
    estimateSec: 90,
    order: 11,
  },
  {
    id: "strace",
    name: "Strace",
    nameEn: "Strace",
    installCmd: "pkg install -y strace",
    checkCmd: "command -v strace >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y strace",
    estimateSec: 20,
    order: 12,
  },
  {
    id: "ltrace",
    name: "Ltrace",
    nameEn: "Ltrace",
    installCmd: "pkg install -y ltrace",
    checkCmd: "command -v ltrace >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y ltrace",
    estimateSec: 20,
    order: 13,
  },
  {
    id: "gdb",
    name: "GDB",
    nameEn: "GDB",
    installCmd: "pkg install -y gdb",
    checkCmd: "command -v gdb >/dev/null 2>&1",
    removeCmd: "pkg uninstall -y gdb",
    estimateSec: 60,
    order: 14,
  },
  {
    id: "frida-tools",
    name: "Frida Tools",
    nameEn: "Frida Tools",
    installCmd: `set +e
pkg install -y root-repo 2>&1 | tail -3
pkg install -y frida 2>&1
# CLI may be absent; server/inject is enough for device-side
if command -v frida >/dev/null 2>&1 || command -v frida-server >/dev/null 2>&1 || command -v frida-inject >/dev/null 2>&1; then
  frida-server --version 2>&1 | head -1 || frida --version 2>&1 | head -1 || true
  echo FRIDA_OK
  exit 0
fi
echo FRIDA_FAIL
exit 1`,
    checkCmd: `command -v frida >/dev/null 2>&1 || command -v frida-server >/dev/null 2>&1 || command -v frida-inject >/dev/null 2>&1`,
    removeCmd: "pkg uninstall -y frida frida-server 2>/dev/null; true",
    estimateSec: 90,
    order: 15,
  },
  {
    id: "capstone",
    name: "Capstone",
    nameEn: "Capstone",
    installCmd: "pkg install -y capstone",
    checkCmd: "command -v cstool >/dev/null 2>&1 || (command -v python >/dev/null 2>&1 && python -c 'import capstone' 2>/dev/null)",
    removeCmd: "pkg uninstall -y capstone",
    estimateSec: 40,
    order: 16,
  },
  {
    id: "androguard",
    name: "Androguard",
    nameEn: "Androguard",
    installCmd: 'echo "PYTHON_TOOL_BLOCKED: Androguard is not installed automatically because pip dependency resolution is not integrity-pinned on Termux." >&2; exit 125',
    checkCmd: "python -c 'import androguard' 2>/dev/null || command -v androguard >/dev/null 2>&1",
    removeCmd: "pip uninstall -y androguard 2>/dev/null; true",
    estimateSec: 60,
    order: 17,
    blocked: true,
    blockedReason: "pip без pinned SHA-256 — автоустановка отключена",
  },
  {
    id: "apkleaks",
    name: "APKLeaks",
    nameEn: "APKLeaks",
    installCmd: 'echo "PYTHON_TOOL_BLOCKED: APKLeaks is not installed automatically because pip dependency resolution is not integrity-pinned on Termux." >&2; exit 125',
    checkCmd: "command -v apkleaks >/dev/null 2>&1 || python -c 'import apkleaks' 2>/dev/null",
    removeCmd: "pip uninstall -y apkleaks 2>/dev/null; true",
    estimateSec: 45,
    order: 18,
    blocked: true,
    blockedReason: "pip без pinned SHA-256 — автоустановка отключена",
  },
  {
    id: "objection",
    name: "Objection",
    nameEn: "Objection",
    installCmd: 'echo "PYTHON_TOOL_BLOCKED: Objection is not installed automatically because pip dependency resolution is not integrity-pinned on Termux." >&2; exit 125',
    checkCmd: "command -v objection >/dev/null 2>&1",
    removeCmd: "pip uninstall -y objection 2>/dev/null; true",
    estimateSec: 60,
    order: 19,
    blocked: true,
    blockedReason: "pip без pinned SHA-256 — автоустановка отключена",
  },
  {
    id: "mitmproxy",
    name: "mitmproxy",
    nameEn: "mitmproxy",
    installCmd: 'echo "PYTHON_TOOL_BLOCKED: mitmproxy is not installed automatically because pip dependency resolution is not integrity-pinned on Termux." >&2; exit 125',
    checkCmd: "command -v mitmproxy >/dev/null 2>&1 || command -v mitmdump >/dev/null 2>&1",
    removeCmd: "pip uninstall -y mitmproxy 2>/dev/null; true",
    estimateSec: 90,
    order: 20,
    blocked: true,
    blockedReason: "pip без pinned SHA-256 — автоустановка отключена",
  },

];

const STORAGE_KEY = "aibuilder.reverse_packages.installed.v1";

export type PackageStatus = "unknown" | "missing" | "installed" | "installing" | "removing" | "error" | "blocked" | "checking";

export interface PackageRuntimeState {
  status: PackageStatus;
  progress: number;
  detail?: string;
  lastError?: string;
}

const INSTALL_TIMEOUT_MS = 900_000;
const CHECK_TIMEOUT_MS = 25_000;
const REMOVE_TIMEOUT_MS = 180_000;
const UPDATE_TIMEOUT_MS = 300_000;

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function loadReverseInstalledMap(): Promise<Record<string, boolean>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

async function saveReverseInstalledMap(map: Record<string, boolean>) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export async function verifyReversePackageInstalled(def: ReversePackageDef): Promise<boolean> {
  try {
    const r = await runShellCommand(withCheckEnvironment(def.checkCmd), { timeoutMs: CHECK_TIMEOUT_MS });
    return r.exitCode === 0 && !r.timedOut;
  } catch {
    return false;
  }
}

export async function verifyAllReversePackages(
  onUpdate?: (id: string, installed: boolean) => void
): Promise<Record<string, boolean>> {
  const cached = await loadReverseInstalledMap();
  const result: Record<string, boolean> = {};
  for (const def of REVERSE_PACKAGES) {
    let ok = false;
    try {
      ok = await verifyReversePackageInstalled(def);
    } catch {
      ok = !!cached[def.id];
    }
    result[def.id] = ok;
    onUpdate?.(def.id, ok);
    await delay(80);
  }
  await saveReverseInstalledMap(result);
  return result;
}

export async function installReversePackage(
  def: ReversePackageDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `ReversePkg:${def.id}`;
  const tick = (p: number, detail: string) => {
    if (shouldAbort?.()) return;
    onProgress(Math.min(99, Math.max(0, p)), detail);
  };

  try {
    // Заблокированные pip-инструменты: не гоняем pkg update и не врём прогрессом.
    if (def.blocked) {
      const reason = def.blockedReason || "установка отключена (нет integrity pin)";
      tick(0, "Заблокировано");
      return { ok: false, error: `BLOCKED: ${reason}` };
    }

    tick(3, "Подготовка…");
    await delay(200);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    if (!def.installCmd.startsWith("pip ") && !def.installCmd.includes("PYTHON_TOOL_BLOCKED")) {
      tick(5, "Настройка зеркал Termux…");
      try {
        // Явно создаём chosen_mirrors + sources, затем update
        await runShellCommand(
          withInstallerEnvironment(
            'echo "mirrors=$(cat $PREFIX/etc/termux/chosen_mirrors 2>/dev/null | head -1)"; ' +
            'pkg update -y 2>&1 | tail -8'
          ),
          { timeoutMs: UPDATE_TIMEOUT_MS },
        );
      } catch (e) {
        persistentLogger.add("warn", tag, `pkg update soft-fail: ${e}`);
      }
      await delay(300);
      if (shouldAbort?.()) return { ok: false, error: "aborted" };
      tick(12, `Установка ${def.name}…`);
    }

    tick(15, `Установка ${def.name}…`);
    const est = Math.max(20, def.estimateSec);
    const start = Date.now();
    let installDone = false;
    let installResult: TermuxCommandResult | null = null;
    let installError: string | undefined;

    // Таймер только до ~70%. 90–100% — после реального exit + verify.
    const progressTimer = setInterval(() => {
      if (installDone || shouldAbort?.()) return;
      const elapsed = (Date.now() - start) / 1000;
      const ratio = Math.min(1, elapsed / est);
      const p = 15 + Math.floor(55 * (1 - Math.exp(-2.2 * ratio)));
      tick(p, `Установка ${def.name}… ${Math.round(elapsed)}с`);
    }, 800);

    try {
      installResult = await runShellCommand(withInstallerEnvironment(def.installCmd), {
        timeoutMs: INSTALL_TIMEOUT_MS,
        isBuild: true,
      });
    } catch (e: unknown) {
      installError = e instanceof Error ? e.message : String(e);
    } finally {
      installDone = true;
      clearInterval(progressTimer);
    }

    if (shouldAbort?.()) return { ok: false, error: "aborted" };
    if (installError) {
      tick(0, "Ошибка");
      return { ok: false, error: installError };
    }
    if (!installResult || installResult.timedOut) {
      tick(0, "Таймаут");
      return { ok: false, error: "timeout" };
    }

    tick(92, "Проверка установки…");
    await delay(400);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    const verified = await verifyReversePackageInstalled(def);
    if (verified) {
      tick(100, "Установлено");
      const map = await loadReverseInstalledMap();
      map[def.id] = true;
      await saveReverseInstalledMap(map);
      return { ok: true };
    }

    const errOut = (installResult.stderr || installResult.stdout || "").slice(-300);
    tick(0, "Не удалось подтвердить");
    return {
      ok: false,
      error: installResult.exitCode !== 0
        ? `exit ${installResult.exitCode}: ${errOut}`
        : `verify failed: ${errOut}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}

export async function removeReversePackage(
  def: ReversePackageDef,
  onProgress: (p: number, detail: string) => void,
  shouldAbort?: () => boolean
): Promise<{ ok: boolean; error?: string }> {
  const tag = `ReversePkg:${def.id}`;
  try {
    onProgress(10, "Удаление…");
    await delay(150);
    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    const r = await runShellCommand(withInstallerEnvironment(def.removeCmd), {
      timeoutMs: REMOVE_TIMEOUT_MS,
      isBuild: true,
    });

    if (shouldAbort?.()) return { ok: false, error: "aborted" };

    onProgress(80, "Проверка…");
    await delay(300);

    const stillThere = await verifyReversePackageInstalled(def);
    if (!stillThere) {
      onProgress(100, "Удалено");
      const map = await loadReverseInstalledMap();
      map[def.id] = false;
      await saveReverseInstalledMap(map);
      return { ok: true };
    }

    if (r.exitCode === 0 && !r.timedOut && stillThere) {
      return {
        ok: false,
        error: "uninstall exit 0, but verify still detects the package",
      };
    }

    return {
      ok: false,
      error: r.timedOut ? "timeout" : `exit ${r.exitCode}`,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    persistentLogger.add("error", tag, msg);
    onProgress(0, "Ошибка");
    return { ok: false, error: msg };
  }
}
