/**
 * The arena catalog, sourced from the router (the source of truth for which
 * models are available and enabled). Cached briefly so generate/leaderboard
 * don't hit the router on every request.
 */
import { routerModelsResponseSchema, type ArenaModelDTO } from "@ttsa/shared";
import { serverEnv } from "../env";

const TTL_MS = 30_000;
let cache: { at: number; models: ArenaModelDTO[] } | null = null;

/** Fetch the available arena models from the router (cached). */
export async function getCatalog(): Promise<ArenaModelDTO[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;

  const apiKey = serverEnv.router.apiKey();
  const res = await fetch(`${serverEnv.router.url()}/models`, {
    headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Router /models ${res.status}`);

  const { models } = routerModelsResponseSchema.parse(await res.json());
  cache = { at: Date.now(), models };
  return models;
}

export async function getCatalogModel(
  id: string,
): Promise<ArenaModelDTO | undefined> {
  return (await getCatalog()).find((m) => m.id === id);
}
