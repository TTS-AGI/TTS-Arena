/**
 * Seed the `models` table from the arena catalog (the same registry the router
 * serves). We import the provider packages directly for their registration
 * side effects, so seeding needs no running router.
 *
 * Idempotent: existing rows have their display metadata refreshed but their
 * ratings/counts are preserved, so re-seeding after a roster change is safe.
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
        // Refresh display metadata only — never reset rating/deviation/counts.
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
  console.info(`Seeded ${catalog.length} models.`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
