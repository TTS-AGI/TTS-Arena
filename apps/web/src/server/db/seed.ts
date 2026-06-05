/**
 * Seed the `models` table from the provider packages we can import directly.
 *
 * This is just a warm start so the leaderboard isn't empty on first boot; it
 * doesn't need to be exhaustive. The authoritative roster is the router
 * catalog, and every model (public or private) is upserted into the DB at
 * generate time via ensureModelsSeeded — so a vote can never reference an
 * unseeded model even if it's not listed here.
 *
 * Kept dependency-free of the arena layer because the Space runtime image only
 * ships src/server/db (not src/server/arena).
 *
 * Idempotent: display metadata is refreshed; ratings/counts are preserved.
 *
 * Run with: bun run db:seed
 */
import { allArenaModels } from "@ttsa/provider-sdk";
import "@ttsa/provider-elevenlabs";
import "@ttsa/provider-minimax";
import { db } from "./client";
import { models } from "./schema";

async function seed() {
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
          icon: m.icon ?? null,
          updatedAt: new Date(),
        },
      });
  }
  console.info(`Seeded ${catalog.length} models from provider packages.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
