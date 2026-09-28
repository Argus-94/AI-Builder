/**
 * App-layer access to AIBuilderTermux RuntimeFacade.
 * Singleton-style helper; safe to import from UI / agent code.
 * Runtime-only — does not touch compilation settings.
 */

import {
  createRuntimeFacade,
  type RuntimeFacade,
  type RuntimeFacadeOptions,
} from "../core/RuntimeFacade";
import { createDefaultBootstrapRunner } from "./bootstrap-stage-runner";

let singleton: RuntimeFacade | null = null;

export function getRuntimeFacade(options?: RuntimeFacadeOptions): RuntimeFacade {
  if (!singleton) {
    singleton = createRuntimeFacade(options);
    singleton.registerDefaultToolchainSources();
    singleton.bindBootstrapRunner(createDefaultBootstrapRunner());
    // Recover unfinished maintenance journal entries from a previous crash (best-effort).
    void singleton.recoverPendingTransactions().catch(() => {
      /* non-fatal */
    });
  }
  return singleton;
}

/** Test / recovery helper: drop singleton so next get creates a fresh facade. */
export function resetRuntimeFacade(): void {
  singleton = null;
}

export type { RuntimeFacade, RuntimeFacadeOptions };
