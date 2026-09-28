/** Runtime-neutral execution environment contract. */
export interface ExecutionEnvironment {
  exec(command: string, options?: { cwd?: string; env?: Record<string, string>; timeoutMs?: number }): Promise<unknown>;
  spawn(command: string, options?: { cwd?: string; env?: Record<string, string> }): Promise<unknown>;
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
  getHome(): Promise<string> | string;
}
