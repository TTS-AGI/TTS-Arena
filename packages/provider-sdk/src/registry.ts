/**
 * Provider registry — a tiny factory the router and provider packages share.
 *
 * Public providers (in this monorepo) and private providers (separate, possibly
 * closed-source packages) both register the same way: import the package for
 * its side effect, and it calls `registerProvider(...)`. The router then loads
 * an env-configured allowlist of extra packages at boot, so the public repo
 * carries zero trace of private models.
 */
import type { TTSProvider } from "./types";

const registry = new Map<string, TTSProvider>();

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

/** Test/boot helper: clear the registry. */
export function clearRegistry(): void {
  registry.clear();
}
