import * as FileSystem from "expo-file-system/legacy";

export type EvidenceRef = { kind: string; path: string; sha256: string; bytes: number };

/** Evidence is kept inside the project-scoped app sandbox. No model-supplied path is accepted. */
export class DeviceEvidenceStore {
  readonly root: string;
  constructor(projectPath: string, runId: string) {
    const base = `${FileSystem.documentDirectory || "file:///data/data/com.aibuilder/files/"}aibuilder-evidence/`;
    this.root = `${base}${safe(projectPath.split(/[\\/]/).pop() || "project")}/${safe(runId)}/`;
  }
  async init(): Promise<void> { await FileSystem.makeDirectoryAsync(this.root, { intermediates: true }); }
  async write(testId: string, name: string, data: string | Uint8Array, kind = "artifact"): Promise<EvidenceRef> {
    await this.init();
    const path = `${this.root}${safe(testId)}/${safe(name)}`;
    await FileSystem.makeDirectoryAsync(`${this.root}${safe(testId)}/`, { intermediates: true });
    const isBinary = data instanceof Uint8Array;
    const text = isBinary ? bytesToBase64(data) : String(data);
    await FileSystem.writeAsStringAsync(path, text, { encoding: isBinary ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8 });
    return { kind, path, sha256: simpleHash(text), bytes: isBinary ? data.byteLength : text.length };
  }
  writeJson(testId: string, name: string, value: unknown): Promise<EvidenceRef> { return this.write(testId, name, JSON.stringify(value, null, 2), "json"); }
  relative(ref: EvidenceRef): string { return ref.path.startsWith(this.root) ? ref.path.slice(this.root.length) : ref.path; }
}
function safe(v: string): string { const s = String(v).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 120); return s || "item"; }
function bytesToBase64(bytes: Uint8Array): string { let s = ""; const chunk = 0x8000; for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length))); return globalThis.btoa ? globalThis.btoa(s) : s; }
function simpleHash(value: string): string { let h1 = 0x811c9dc5; for (let i = 0; i < value.length; i++) { h1 ^= value.charCodeAt(i); h1 = Math.imul(h1, 0x01000193); } return (h1 >>> 0).toString(16).padStart(8, "0"); }
