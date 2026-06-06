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
// Import every public provider for its registration side effect, so the boot
// seed knows each model's metadata — crucially its icon — even when the model
// isn't currently serveable (no API key on this deploy). Icons therefore show
// up after deploy without waiting for a battle. Private providers aren't bundled
// here; their metadata is refreshed from the router catalog at generate time.
import "@ttsa/provider-elevenlabs";
import "@ttsa/provider-minimax";
import "@ttsa/provider-cartesia";
import "@ttsa/provider-hume";
import "@ttsa/provider-typecast";
import "@ttsa/provider-gradium";
import "@ttsa/provider-chatterbox";
import "@ttsa/provider-inworld";
import "@ttsa/provider-mars";
import "@ttsa/provider-tontaube";
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
        // Refresh display metadata only. Don't touch isActive on conflict — it's
        // admin-controlled, and a reboot shouldn't silently re-enable a model an
        // admin turned off.
        set: {
          name: m.name,
          isOpen: m.open,
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
