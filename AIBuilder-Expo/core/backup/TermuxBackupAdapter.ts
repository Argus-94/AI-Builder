import type { ExecutionEnvironment } from "../environment/ExecutionEnvironment";
import type { HomeLayout } from "../home/HomeLayout";
import type { BackupAdapter, BackupManifest } from "./BackupManager";

function q(value: string): string { return JSON.stringify(value); }

/** Real Android/Termux adapter: tar.gz staging + gzip CRC + sha256 verification. */
export class TermuxBackupAdapter implements BackupAdapter {
  constructor(private readonly env: ExecutionEnvironment, private readonly home: HomeLayout) {}
  private archive(destination: string) { return `${destination.replace(/[\\/]+$/, "")}/ai-builder-data.tar.gz`; }
  private manifest(destination: string) { return `${destination.replace(/[\\/]+$/, "")}/manifest.json`; }

  async ensureDir(path: string) { await this.env.mkdir(path); }

  async snapshot(paths: string[], destination: string) {
    if (!paths.length) return;
    await this.ensureDir(destination);
    const rel = paths.map((p) => {
      const root = this.home.root.replace(/[\\/]+$/, "") + "/";
      if (!p.startsWith(root)) throw new Error("BACKUP_PATH_OUTSIDE_HOME");
      return p.slice(root.length).replace(/^\/+/, "");
    });
    const command = `tar -czf ${q(this.archive(destination))} -C ${q(this.home.root)} ${rel.map(q).join(" ")}`;
    const result = await this.env.exec(command, { cwd: this.home.root }) as { exitCode: number; stderr?: string };
    if (result.exitCode !== 0) throw new Error(result.stderr || "BACKUP_ARCHIVE_FAILED");
  }

  async inspect(destination: string) {
    const archive = this.archive(destination);
    const check = await this.env.exec(`tar -tzf ${q(archive)} >/dev/null && sha256sum ${q(archive)}`) as { exitCode: number; stderr?: string; stdout?: string };
    if (check.exitCode !== 0) return { ok: false, bytes: 0, files: 0, error: check.stderr || "BACKUP_CORRUPT" };
    const digest = String(check.stdout || "").trim().split(/\s+/)[0];
    const size = await this.env.exec(`wc -c < ${q(archive)}`) as { stdout?: string };
    const files = await this.env.exec(`tar -tzf ${q(archive)} | wc -l`) as { stdout?: string };
    return { ok: true, bytes: Number(String(size.stdout || "0").trim()) || 0, files: Number(String(files.stdout || "0").trim()) || 0, digest };
  }

  async restore(source: string, _paths: string[]) {
    const archive = this.archive(source);
    const result = await this.env.exec(`tar -xzf ${q(archive)} -C ${q(this.home.root)}`) as { exitCode: number; stderr?: string };
    if (result.exitCode !== 0) throw new Error(result.stderr || "BACKUP_RESTORE_FAILED");
  }

  async writeManifest(destination: string, manifest: BackupManifest) { await this.env.write(this.manifest(destination), JSON.stringify(manifest, null, 2)); }
  async readManifest(source: string) {
    try { return JSON.parse(await this.env.read(this.manifest(source))) as BackupManifest; } catch { return null; }
  }

  /** List immediate subdirectories of parent (backup destinations). */
  async listChildren(parent: string): Promise<string[]> {
    try {
      const r = await this.env.exec(
        `ls -1 ${q(parent)} 2>/dev/null | head -80`,
      ) as { exitCode?: number; stdout?: string };
      if ((r.exitCode ?? 1) !== 0) return [];
      return String(r.stdout || "")
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }
}
