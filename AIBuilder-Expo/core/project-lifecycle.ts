/**
 * Runtime-only project lifecycle orchestration.
 *
 * Coordinates project payload directories and project metadata. It does not
 * know about containers, toolchains, Gradle, Expo, or Android compilation.
 */
import type { HomeLayout } from './home/HomeLayout';
import { ProjectManager, validateProjectName, type ProjectManagerFileSystem, type ProjectInfo } from './project-manager';
import { ProjectMetadataStore, type ProjectMetadata, type ProjectMetadataFileSystem, projectMetadataPath } from './project-metadata';
import { ProjectStorage } from './project-storage';

export interface ProjectLifecycleFileSystem extends ProjectManagerFileSystem, ProjectMetadataFileSystem {
  removeDirectory(path: string): Promise<void> | void;
  moveDirectory(from: string, to: string): Promise<void> | void;
  removeFile(path: string): Promise<void> | void;
}

export interface ProjectLifecycleCreateOptions {
  readonly metadata?: Omit<ProjectMetadata, 'projectName'>;
}

function projectDirectory(layout: HomeLayout, name: string): string {
  return `${layout.projects.replace(/[\\/]+$/, '')}/${validateProjectName(name)}`;
}

export class ProjectLifecycle {
  private readonly manager: ProjectManager;
  private readonly metadata: ProjectMetadataStore;
  private readonly storage: ProjectStorage;

  constructor(
    private readonly layout: HomeLayout,
    private readonly fs: ProjectLifecycleFileSystem,
  ) {
    this.manager = new ProjectManager(layout, fs);
    this.metadata = new ProjectMetadataStore(layout, fs);
    this.storage = new ProjectStorage(layout, fs);
  }

  async create(name: string, options: ProjectLifecycleCreateOptions = {}): Promise<ProjectInfo> {
    const info = await this.manager.createProject(name);
    const metadata: ProjectMetadata = {
      ...(options.metadata ?? {}),
      projectName: info.name,
    };
    await this.metadata.write(info.name, metadata);
    return info;
  }

  async open(name: string): Promise<ProjectInfo> {
    const normalized = validateProjectName(name);
    const path = projectDirectory(this.layout, normalized);
    const exists = await this.fs.listDirectories(this.layout.projects);
    if (!exists.map((entry) => entry.trim()).includes(normalized)) {
      throw new Error('PROJECT_NOT_FOUND');
    }
    await this.metadata.read(normalized);
    return { name: normalized, path };
  }

  async delete(name: string): Promise<void> {
    const normalized = validateProjectName(name);
    const path = projectDirectory(this.layout, normalized);
    await this.metadata.read(normalized);
    await this.fs.removeDirectory(path);
    await this.fs.removeFile(projectMetadataPath(this.layout, normalized));
  }

  async rename(from: string, to: string): Promise<ProjectInfo> {
    const source = validateProjectName(from);
    const target = validateProjectName(to);
    if (source === target) return this.open(source);

    const sourcePath = projectDirectory(this.layout, source);
    const targetPath = projectDirectory(this.layout, target);
    const entries = await this.fs.listDirectories(this.layout.projects);
    const names = entries.map((entry) => entry.trim());
    if (!names.includes(source)) throw new Error('PROJECT_NOT_FOUND');
    if (names.includes(target)) throw new Error('PROJECT_ALREADY_EXISTS');

    const currentMetadata = await this.metadata.read(source);
    await this.fs.moveDirectory(sourcePath, targetPath);
    try {
      await this.metadata.write(target, { ...currentMetadata, projectName: target });
      await this.fs.removeFile(projectMetadataPath(this.layout, source));
    } catch (error) {
      // Best-effort rollback: preserve the original project if metadata update fails.
      try { await this.fs.moveDirectory(targetPath, sourcePath); } catch { /* preserve original error */ }
      throw error;
    }
    return { name: target, path: targetPath };
  }

  /** Exposes storage only for lifecycle clients that need project payload access. */
  get projectStorage(): ProjectStorage { return this.storage; }
}
