/**
 * The arena catalog, sourced from the router (the source of truth for which
 * models are available and enabled). Cached briefly so generate/leaderboard
 * don't hit the router on every request.
 */
import { routerModelsResponseSchema, type ArenaModelDTO } from "@ttsa/shared";
import { serverEnv } from "../env";
import { db, withWriteRetry } from "../db/client";
import { models as modelsTable } from "../db/schema";
import { logErrorEvent } from "../observability/errors";

const TTL_MS = 30_000;
let cache: { at: number; models: ArenaModelDTO[] } | null = null;

/** Fetch the available arena models from the router (cached). */
export async function getCatalog(): Promise<ArenaModelDTO[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.models;

  const apiKey = serverEnv.router.apiKey();
  const url = `${serverEnv.router.url()}/models`;
  let res: Response;
  try {
    res = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    console.error("[catalog] router /models unreachable", { url, reason });
    void logErrorEvent({
      source: "catalog",
      message: `router /models unreachable: ${reason}`,
      detail: { url, kind: "network" },
    });
    throw new Error(`Router /models unreachable: ${reason}`);
  }
  if (!res.ok) {
    console.error("[catalog] router /models non-OK", {
      url,
      status: res.status,
    });
    void logErrorEvent({
      source: "catalog",
      message: `router /models ${res.status}`,
      status: res.status,
      detail: { url },
    });
    throw new Error(`Router /models ${res.status}`);
  }

  const { models } = routerModelsResponseSchema.parse(await res.json());
  if (models.length === 0) {
    console.warn("[catalog] router returned 0 available models");
  }
  cache = { at: Date.now(), models };
  return models;
}

export async function getCatalogModel(
  id: string,
): Promise<ArenaModelDTO | undefined> {
  return (await getCatalog()).find((m) => m.id === id);
}

/**
 * Ensure every given catalog model has a row in `models`, so votes (which FK to
 * models.id) never fail for a router model that was never seeded. Display
 * metadata is refreshed; ratings/counts are preserved. Idempotent.
 *
 * The router is the source of truth for the catalog, but ratings live in the
 * web DB — this keeps the two in sync without a manual re-seed whenever the
 * router's roster changes.
 */
export async function ensureModelsSeeded(dtos: ArenaModelDTO[]): Promise<void> {
  if (dtos.length === 0) return;
  await withWriteRetry(() =>
    db.transaction((tx) => {
      for (const m of dtos) {
        tx.insert(modelsTable)
          .values({
            id: m.id,
            name: m.name,
            modelType: "tts",
            isOpen: m.open,
            isActive: m.enabled,
            url: m.url,
            icon: m.icon ?? null,
          })
          .onConflictDoUpdate({
            target: modelsTable.id,
            // Refresh display metadata only — never reset rating/counts.
            set: {
              name: m.name,
              isOpen: m.open,
              isActive: m.enabled,
              url: m.url,
              icon: m.icon ?? null,
              updatedAt: new Date(),
            },
          })
          .run();
      }
    }),
  );
}
