/**
 * Provider loading.
 *
 * Public providers are imported directly (their import side-effect registers
 * them). Private providers live in separate packages outside this repo; the
 * router loads them from the `PROVIDER_PLUGINS` env var (a comma-separated list
 * of package specifiers), so the open-source router carries no trace of them.
 */
import { env } from "@ttsa/provider-sdk";

// Public, in-repo providers — registered via import side effect.
import "@ttsa/provider-elevenlabs";
import "@ttsa/provider-minimax";

let loaded = false;

/** Load env-allowlisted private provider plugins. Idempotent. */
export async function loadPlugins(): Promise<void> {
  if (loaded) return;
  loaded = true;

  const spec = env("PROVIDER_PLUGINS");
  if (!spec) return;

  for (const name of spec
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)) {
    try {
      await import(name);
      console.info(`[router] loaded provider plugin: ${name}`);
    } catch (err) {
      console.error(`[router] failed to load provider plugin "${name}":`, err);
    }
  }
}
