import { executeGuardedTermuxCommand } from '../../lib/termux-executor';
import { createHomeEnvironment } from '../home/HomeEnvironment';
import type { ExecutionEnvironment } from './ExecutionEnvironment';

/** First concrete runtime implementation, backed by the existing Termux bridge. */
export class AIBuilderTermuxEnvironment implements ExecutionEnvironment {
  constructor(private readonly home: string = createHomeEnvironment().HOME) {}

  async exec(command: string, options: { cwd?: string; env?: Record<string, string>; timeoutMs?: number } = {}) {
    const prefix = options.env
      ? Object.entries(options.env).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(' ') + ' '
      : '';
    return executeGuardedTermuxCommand(prefix + command, {
      workdir: options.cwd,
      timeoutMs: options.timeoutMs,
    });
  }

  async spawn(command: string, options: { cwd?: string; env?: Record<string, string> } = {}) {
    return this.exec(command, { ...options });
  }

  async read(path: string): Promise<string> {
    const result = await this.exec(`cat -- ${JSON.stringify(path)}`);
    return result.stdout;
  }

  async write(path: string, content: string): Promise<void> {
    await this.exec(`printf '%s' ${JSON.stringify(content)} > ${JSON.stringify(path)}`);
  }

  async exists(path: string): Promise<boolean> {
    const result = await this.exec(`test -e ${JSON.stringify(path)}`);
    return result.exitCode === 0;
  }

  async mkdir(path: string): Promise<void> {
    await this.exec(`mkdir -p -- ${JSON.stringify(path)}`);
  }

  getHome(): string { return this.home; }
}
