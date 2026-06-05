/**
 * Seed the `models` table.
 *
 * The router is the source of truth for the catalog, so we try it first
 * (getCatalog → ensureModelsSeeded). If the router isn't up yet (the entrypoint
 * seeds before starting it), fall back to the provider packages we can import
 * directly. Either way it's idempotent: display metadata is refreshed, ratings
 * and counts are preserved. Models also self-heal at generate time via
 * ensureModelsSeeded, so a stale seed can't break voting.
 *
 * Run with: bun run db:seed
 */
import { allArenaModels } from "@ttsa/provider-sdk";
import "@ttsa/provider-elevenlabs";
import "@ttsa/provider-minimax";
import { db } from "./client";
import { models } from "./schema";
import { getCatalog, ensureModelsSeeded } from "../arena/catalog";

async function seedFromRouter(): Promise<number> {
  const catalog = await getCatalog();
  if (catalog.length === 0) throw new Error("router returned no models");
  await ensureModelsSeeded(catalog);
  return catalog.length;
}

async function seedFromPackages(): Promise<number> {
  const catalog = allArenaModels();
  for (const m of catalog) {
    await db
      .insert(models)
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
        target: models.id,
        set: {
          name: m.name,
          isOpen: m.open,
          isActive: m.enabled,
          url: m.url,
          icon: (m.icon as string | undefined) ?? null,
          updatedAt: new Date(),
        },
      });
  }
  return catalog.length;
}

async function seed() {
  try {
    const n = await seedFromRouter();
    console.info(`Seeded ${n} models from the router catalog.`);
  } catch (err) {
    console.warn(
      `Router catalog unavailable (${err instanceof Error ? err.message : err}); seeding from provider packages.`,
    );
    const n = await seedFromPackages();
    console.info(`Seeded ${n} models from provider packages.`);
  }
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
