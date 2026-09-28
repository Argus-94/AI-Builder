import { runShellCommand } from "./termux-bridge";

export const SIGNING_ROOT = "/storage/emulated/0/AIBuilderTermux/.aibuilder/keys";

function shellQuote(value: string): string {
  return `'${String(value).replace(/'/g, `'"'"'`)}'`;
}

function sanitizeFileName(value: string): string {
  const clean = value.trim().replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return clean || "aib-signing-key";
}

export type SigningCommandResult = { stdout: string; stderr: string; exitCode: number; timedOut: boolean };

export type SigningKeyInfo = { name: string; path: string; size: number };

export async function createSigningKeystore(options: {
  fileName: string;
  alias: string;
  storePassword: string;
  keyPassword: string;
  validityDays: number;
  commonName: string;
}): Promise<SigningCommandResult> {
  const file = sanitizeFileName(options.fileName).endsWith(".keystore")
    ? sanitizeFileName(options.fileName)
    : `${sanitizeFileName(options.fileName)}.keystore`;
  const alias = options.alias.trim().replace(/[^A-Za-z0-9._-]/g, "-") || "release";
  const validity = Math.max(1, Math.min(36500, Math.floor(options.validityDays || 3650)));
  const cn = options.commonName.trim() || "AI Builder Signing Key";
  const path = `${SIGNING_ROOT}/${file}`;
  const command =
    `set -e; mkdir -p ${shellQuote(SIGNING_ROOT)}; ` +
    `export KEYSTORE_PASSWORD=${shellQuote(options.storePassword)}; export KEY_PASSWORD=${shellQuote(options.keyPassword)}; ` +
    `if [ -e ${shellQuote(path)} ]; then echo "KEYSTORE_EXISTS:${path}" >&2; exit 2; fi; ` +
    `command -v keytool >/dev/null 2>&1 || { echo "KEYTOOL_MISSING" >&2; exit 127; }; ` +
    `keytool -genkeypair -v -keystore ${shellQuote(path)} ` +
    `-storepass "$KEYSTORE_PASSWORD" -keypass "$KEY_PASSWORD" -alias ${shellQuote(alias)} ` +
    `-keyalg RSA -keysize 4096 -validity ${validity} -dname ${shellQuote(`CN=${cn}, O=AI Builder`)}; ` +
    `chmod 600 ${shellQuote(path)}; ` +
    `keytool -list -v -keystore ${shellQuote(path)} -storepass "$KEYSTORE_PASSWORD" -alias ${shellQuote(alias)} | ` +
    `grep -E 'Alias name:|Creation date:|Entry type:|Owner:|Valid from:|SHA256:' || true; ` +
    `echo "KEYSTORE_CREATED:${path}"`;
  return runShellCommand(command, { timeoutMs: 120_000 });
}

export async function inspectSigningKeystore(options: { path: string; password: string; alias?: string }): Promise<SigningCommandResult> {
  const aliasArg = options.alias?.trim() ? `-alias ${shellQuote(options.alias.trim())}` : "";
  const command =
    `set -e; test -s ${shellQuote(options.path)} || { echo "KEYSTORE_NOT_FOUND" >&2; exit 2; }; ` +
    `KEYSTORE_PASSWORD=${shellQuote(options.password)}; command -v keytool >/dev/null 2>&1 || { echo "KEYTOOL_MISSING" >&2; exit 127; }; ` +
    `keytool -list -v -keystore ${shellQuote(options.path)} -storepass "$KEYSTORE_PASSWORD" ${aliasArg} | ` +
    `grep -E 'Keystore type:|Keystore provider:|Alias name:|Creation date:|Entry type:|Owner:|Issuer:|Valid from:|Certificate fingerprints:|SHA256:' || true`;
  return runShellCommand(command, { timeoutMs: 60_000 });
}

export async function signApk(options: {
  inputApk: string;
  outputApk: string;
  keystorePath: string;
  alias: string;
  storePassword: string;
  keyPassword: string;
}): Promise<SigningCommandResult> {
  const command =
    `set -e; ` +
    `test -s ${shellQuote(options.inputApk)} || { echo "INPUT_APK_NOT_FOUND" >&2; exit 2; }; ` +
    `test -s ${shellQuote(options.keystorePath)} || { echo "KEYSTORE_NOT_FOUND" >&2; exit 2; }; ` +
    `export KEYSTORE_PASSWORD=${shellQuote(options.storePassword)}; export KEY_PASSWORD=${shellQuote(options.keyPassword)}; ` +
    `APKSIGNER=$(command -v apksigner || true); ` +
    `if [ -z "$APKSIGNER" ]; then APKSIGNER=$(find "$PREFIX" /data/data/com.termux/files/usr -type f -name apksigner 2>/dev/null | head -n 1); fi; ` +
    `ZIPALIGN=$(command -v zipalign || true); ` +
    `if [ -z "$APKSIGNER" ]; then echo "APKSIGNER_MISSING" >&2; exit 127; fi; ` +
    `mkdir -p "$(dirname ${shellQuote(options.outputApk)})"; ` +
     `TMP=${shellQuote(`${options.outputApk}.aligned.tmp`)}; ` +
    `if [ -n "$ZIPALIGN" ]; then "$ZIPALIGN" -f -p 4 ${shellQuote(options.inputApk)} "$TMP"; SRC="$TMP"; else SRC=${shellQuote(options.inputApk)}; fi; ` +
    `"$APKSIGNER" sign --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true ` +
    `--ks ${shellQuote(options.keystorePath)} --ks-pass env:KEYSTORE_PASSWORD --key-pass env:KEY_PASSWORD ` +
    `--ks-key-alias ${shellQuote(options.alias)} --out ${shellQuote(options.outputApk)} "$SRC"; ` +
    `rm -f "$TMP"; ` +
    `"$APKSIGNER" verify --verbose --print-certs ${shellQuote(options.outputApk)}; ` +
    `echo "APK_SIGNED:${options.outputApk}"`;
  return runShellCommand(command, { timeoutMs: 180_000, isBuild: true });
}


export async function listSigningKeystores(): Promise<SigningCommandResult> {
  const command =
    `set -e; mkdir -p ${shellQuote(SIGNING_ROOT)}; ` +
    `found=0; for f in ${shellQuote(SIGNING_ROOT)}/*.keystore ${shellQuote(SIGNING_ROOT)}/*.jks; do ` +
    `if [ -f "$f" ]; then found=1; printf '%s\t%s\n' "$(basename "$f")" "$(stat -c %s "$f" 2>/dev/null || wc -c < "$f")"; fi; ` +
    `done; if [ "$found" -eq 0 ]; then echo "NO_SIGNING_KEYS"; fi`;
  return runShellCommand(command, { timeoutMs: 30_000 });
}

export async function deleteSigningKeystore(path: string): Promise<SigningCommandResult> {
  const normalized = path.trim();
  if (!normalized.startsWith(`${SIGNING_ROOT}/`) || /[\n\r]/.test(normalized) || normalized === SIGNING_ROOT) {
    throw new Error("INVALID_SIGNING_KEY_PATH");
  }
  const command =
    `set -e; test -f ${shellQuote(normalized)} || { echo "KEYSTORE_NOT_FOUND" >&2; exit 2; }; ` +
    `rm -f ${shellQuote(normalized)}; echo "KEYSTORE_DELETED:${normalized}"`;
  return runShellCommand(command, { timeoutMs: 30_000 });
}

export async function verifyApkSignature(path: string): Promise<SigningCommandResult> {
  const command =
    `set -e; test -s ${shellQuote(path)} || { echo "APK_NOT_FOUND" >&2; exit 2; }; ` +
    `APKSIGNER=$(command -v apksigner || true); ` +
    `if [ -z "$APKSIGNER" ]; then APKSIGNER=$(find "$PREFIX" /data/data/com.termux/files/usr -type f -name apksigner 2>/dev/null | head -n 1); fi; ` +
    `if [ -z "$APKSIGNER" ]; then echo "APKSIGNER_MISSING" >&2; exit 127; fi; ` +
    `"$APKSIGNER" verify --verbose --print-certs ${shellQuote(path)}`;
  return runShellCommand(command, { timeoutMs: 60_000, isBuild: true });
}
