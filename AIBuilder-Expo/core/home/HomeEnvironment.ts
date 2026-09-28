/**
 * Canonical HOME environment for AIBuilderTermux.
 *
 * Runtime-only: this module does not edit project files, Gradle settings,
 * Expo configuration, or Android compilation settings.
 */

import { AI_BUILDER_HOME_ENV, AI_BUILDER_HOME_NAME, createHomeLayout, type HomeLayout } from './HomeLayout';

export const DEFAULT_AI_BUILDER_HOME = '/storage/emulated/0/AIBuilderTermux' as const;

export interface HomeEnvironment {
  readonly HOME: string;
  readonly AI_BUILDER_HOME: string;
  readonly layout: HomeLayout;
}

export interface HomeEnvironmentInput {
  readonly AI_BUILDER_HOME?: string;
  readonly HOME?: string;
}

function normalizeCandidate(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * Resolve the persistent Builder HOME.
 *
 * Priority:
 * 1. AI_BUILDER_HOME when explicitly supplied.
 * 2. HOME only when it already names the AIBuilderTermux home.
 * 3. The Android shared-storage AIBuilderTermux default.
 *
 * An unrelated Termux $HOME is never silently promoted to the Builder HOME.
 */
export function resolveAiBuilderHome(input: HomeEnvironmentInput = {}): string {
  const explicit = normalizeCandidate(input.AI_BUILDER_HOME);
  if (explicit) return explicit;

  const home = normalizeCandidate(input.HOME);
  if (home && home.replace(/[\\/]+$/, '').endsWith(`/${AI_BUILDER_HOME_NAME}`)) {
    return home;
  }

  return DEFAULT_AI_BUILDER_HOME;
}

/** Build the environment contract without mutating process.env. */
export function createHomeEnvironment(input: HomeEnvironmentInput = {}): HomeEnvironment {
  const root = resolveAiBuilderHome(input);
  const layout = createHomeLayout(root);

  return {
    HOME: layout.root,
    AI_BUILDER_HOME: layout.root,
    layout,
  };
}

export const HOME_ENVIRONMENT_KEYS = [AI_BUILDER_HOME_ENV, 'HOME'] as const;
