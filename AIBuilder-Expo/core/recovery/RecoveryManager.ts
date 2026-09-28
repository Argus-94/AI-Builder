/** Runtime recovery registry with observable execution history. */
export type RecoveryActionKind =
  | "restart_terminal" | "reinit_home" | "recreate_session" | "reconnect_bridge"
  | "reset_agent" | "container_restart" | "repair" | "other";
export type RecoveryAction = { readonly id: string; readonly kind: RecoveryActionKind; readonly description: string; readonly run: () => Promise<void> | void; };
export type RecoveryResult = { readonly actionId: string; readonly ok: boolean; readonly error?: string; readonly durationMs: number; };
export type RecoveryEvent = RecoveryResult & { readonly timestamp: number };

export class RecoveryManager {
  private readonly actions = new Map<string, RecoveryAction>();
  private readonly history: RecoveryEvent[] = [];
  register(action: RecoveryAction): void { this.actions.set(action.id, action); }
  list(): RecoveryAction[] { return [...this.actions.values()]; }
  historySnapshot(): RecoveryEvent[] { return [...this.history]; }
  async run(actionId: string): Promise<RecoveryResult> {
    const action = this.actions.get(actionId); const started = Date.now();
    if (!action) { const result = { actionId, ok: false, error: `Unknown recovery action: ${actionId}`, durationMs: 0 }; this.history.push({ ...result, timestamp: Date.now() }); return result; }
    try { await action.run(); const result = { actionId, ok: true, durationMs: Date.now() - started }; this.history.push({ ...result, timestamp: Date.now() }); return result; }
    catch (e) { const result = { actionId, ok: false, error: e instanceof Error ? e.message : String(e), durationMs: Date.now() - started }; this.history.push({ ...result, timestamp: Date.now() }); return result; }
  }
}
export function createRecoveryManager(): RecoveryManager { return new RecoveryManager(); }
