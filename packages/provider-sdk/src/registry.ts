/**
 * Provider registry — a tiny factory the router and provider packages share.
 *
 * Public providers (in this monorepo) and private providers (separate, possibly
 * closed-source packages) both register the same way: import the package for
 * its side effect, and it calls `registerProvider(...)`. The router then loads
 * an env-configured allowlist of extra packages at boot, so the public repo
 * carries zero trace of private models.
 */
import type { ArenaModel, TTSProvider } from "./types";

const registry = new Map<string, TTSProvider>();
const arenaModels = new Map<string, ArenaModel>();

/** Register a provider. Last registration for an id wins (allows overrides). */
export function registerProvider(provider: TTSProvider): void {
  registry.set(provider.id.toLowerCase(), provider);
}

export function getProvider(id: string): TTSProvider | undefined {
  return registry.get(id.toLowerCase());
}

/** All registered providers, regardless of availability. */
export function allProviders(): TTSProvider[] {
  return [...registry.values()];
}

/** Only providers that are configured and ready to serve. */
export function availableProviders(): TTSProvider[] {
  return allProviders().filter((p) => p.isAvailable());
}

/**
 * Register arena models. Provider packages call this (alongside
 * registerProvider) to add their catalog entries. Keyed on the stable `id`.
 */
export function registerArenaModels(models: ArenaModel[]): void {
  for (const m of models) arenaModels.set(m.id, m);
}

export function allArenaModels(): ArenaModel[] {
  return [...arenaModels.values()];
}

/**
 * Arena models that are actually serveable right now: enabled AND their
 * provider is registered and configured. This is the authoritative list the
 * web app battles over.
 */
export function availableArenaModels(): ArenaModel[] {
  const ready = new Set(availableProviders().map((p) => p.id.toLowerCase()));
  return allArenaModels().filter(
    (m) => m.enabled && ready.has(m.provider.toLowerCase()),
  );
}

/** Test/boot helper: clear both registries. */
export function clearRegistry(): void {
  registry.clear();
  arenaModels.clear();
}
