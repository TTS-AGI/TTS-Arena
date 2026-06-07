/**
 * One-time import of historical votes from the old V2 SQLite database
 * (TTS-AGI/database-arena-v2 :: tts_arena.db) into the current Postgres DB.
 *
 * What it does, idempotently:
 *   1. Imports the real voting users (username + hf_id) — but starts every
 *      anti-fraud signal FRESH (trustScore=100, quarantined=false). No old
 *      quarantine/trust state is carried over.
 *   2. Creates "legacy" model rows for V2 models not in the current catalog,
 *      marked isActive=false so the leaderboard shows them with a "retired"
 *      indicator. Their metadata (name/type/url/open) comes from the V2 DB.
 *   3. Maps the two renamed MiniMax slugs onto their current ids so their
 *      history credits the live models.
 *   4. Inserts the historical votes (only those with a real user — V2 had
 *      ~9.5k user-less anonymous votes, which our NOT NULL userId can't take
 *      and which we deliberately drop). The old counts_for_public flag is
 *      preserved verbatim.
 *   5. Replays every clean counting vote chronologically through Glicko-2 via
 *      recomputeFromCleanVotes(), so ratings are computed "as if each were a
 *      new vote" — exactly our live algorithm.
 *
 * Re-running is safe: users are upserted by hf_id, legacy models by id, and
 * votes are skipped entirely if any imported votes already exist (a guard so we
 * don't double-insert). Pass --force to wipe previously-imported votes first.
 *
 * Usage:
 *   V2_DB_PATH=/path/to/tts_arena.db bun run src/server/db/import-v2.ts [--force]
 */
import { Database } from "bun:sqlite";
import { inArray, or, sql } from "drizzle-orm";
import { RANK_THRESHOLD } from "@ttsa/shared";
import { db } from "./client";
import { models, users, votes } from "./schema";
import { recomputeFromCleanVotes } from "./recompute-ratings";

/** Renamed-model map: old V2 slug → current arena slug. */
const MODEL_ID_REMAP: Record<string, string> = {
  "minimax-02-hd": "minimax-speech-02-hd",
  "minimax-02-turbo": "minimax-speech-02-turbo",
};

/**
 * Models whose historical votes are excluded entirely from the import. Any V2
 * vote with one of these on either side is dropped (not imported, not replayed).
 * lanternfish-1 (OpenAudio S1) is excluded because its past votes were gamed.
 */
const EXCLUDED_MODEL_IDS = new Set<string>(["lanternfish-1"]);

/** Logos for retired/legacy models (self-hosted under /public/logos). */
const LEGACY_ICONS: Record<string, string> = {
  maya1: "/logos/maya.webp",
  veena: "/logos/maya.webp",
  magpie: "/logos/nvidia.webp",
  "magpie-rp": "/logos/nvidia.webp",
  wordcab: "/logos/wordcab.webp",
  "spark-tts": "/logos/spark.webp",
  neuphonic: "/logos/neuphonic.webp",
  tontaube: "/logos/tontaube.webp",
  "kokoro-v1": "/logos/kokoro.webp",
  "papla-p1": "/logos/papla.webp",
  "async-1": "/logos/castleflow.webp",
};

type V2User = {
  id: number;
  username: string;
  hf_id: string;
  join_date: string | null;
  hf_account_created: string | null;
};

type V2Model = {
  id: string;
  name: string;
  model_type: string;
  is_open: number | null;
  is_active: number | null;
  model_url: string | null;
};

type V2Vote = {
  user_id: number | null;
  text: string;
  vote_date: string | null;
  model_chosen: string;
  model_rejected: string;
  model_type: string;
  session_duration_seconds: number | null;
  sentence_hash: string | null;
  sentence_origin: string | null;
  counts_for_public_leaderboard: number | null;
};

/** Parse a V2 SQLite DATETIME ("2025-04-22 18:10:25.701836") as UTC. */
function parseV2Date(s: string | null): Date {
  if (!s) return new Date(0);
  // SQLite stores naive UTC; append Z so JS doesn't apply local tz.
  const iso = s.includes("T") ? s : s.replace(" ", "T");
  const d = new Date(iso.endsWith("Z") ? iso : iso + "Z");
  return Number.isNaN(d.getTime()) ? new Date(0) : d;
}

const remap = (id: string) => MODEL_ID_REMAP[id] ?? id;

async function main() {
  const dbPath = process.env.V2_DB_PATH;
  if (!dbPath) {
    console.error("[import-v2] V2_DB_PATH is not set (path to tts_arena.db)");
    process.exit(1);
  }
  const force = process.argv.includes("--force");

  const src = new Database(dbPath, { readonly: true });

  // ── Guard: don't double-import ────────────────────────────────────────────
  // If the target already has votes, refuse — re-running would double-insert.
  // Pass --force to wipe existing votes and re-import from scratch.
  const [{ n: existingVotes }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(votes);
  if (existingVotes > 0 && !force) {
    console.error(
      `[import-v2] target already has ${existingVotes} votes — refusing to ` +
        `import (pass --force to wipe votes and re-import).`,
    );
    process.exit(1);
  }
  if (force && existingVotes > 0) {
    console.info(
      `[import-v2] --force: deleting ${existingVotes} existing votes`,
    );
    await db.delete(votes);
  }

  // ── 1. Build the set of model ids that will exist after import ────────────
  const existingModels = await db.select({ id: models.id }).from(models);
  const presentIds = new Set(existingModels.map((m) => m.id));

  // V2 models referenced by votes (chosen or rejected).
  const v2VotedModelIds = new Set<string>();
  for (const row of src
    .query(
      "select distinct model_chosen as id from vote union select distinct model_rejected as id from vote",
    )
    .all() as { id: string }[]) {
    v2VotedModelIds.add(row.id);
  }

  // Legacy models = voted-in-V2, not present in target, and not a remap target.
  const legacyIds = [...v2VotedModelIds].filter(
    (id) => !presentIds.has(id) && !(id in MODEL_ID_REMAP),
  );

  const v2Models = new Map<string, V2Model>();
  for (const m of src.query("select * from model").all() as V2Model[]) {
    v2Models.set(m.id, m);
  }

  // ── 2. Insert legacy model stubs (isActive=false) ────────────────────────
  let legacyCreated = 0;
  for (const id of legacyIds) {
    const m = v2Models.get(id);
    if (!m) continue;
    const icon = LEGACY_ICONS[m.id] ?? null;
    await db
      .insert(models)
      .values({
        id: m.id,
        name: m.name,
        modelType: m.model_type,
        provider: null,
        isOpen: !!m.is_open,
        isActive: false, // retired — shown on leaderboard, not battled
        url: m.model_url,
        icon,
      })
      .onConflictDoUpdate({
        target: models.id,
        set: {
          name: m.name,
          modelType: m.model_type,
          isOpen: !!m.is_open,
          isActive: false,
          url: m.model_url,
          icon,
          updatedAt: new Date(),
        },
      });
    presentIds.add(m.id);
    legacyCreated++;
  }
  console.info(`[import-v2] legacy model stubs upserted: ${legacyCreated}`);

  // ── 3. Import voting users (fresh fraud signals) ─────────────────────────
  // Only users who actually cast a vote we'll import.
  const v2Users = new Map<number, V2User>();
  for (const u of src.query("select * from user").all() as V2User[]) {
    v2Users.set(u.id, u);
  }

  const voterIds = new Set<number>();
  for (const r of src
    .query("select distinct user_id from vote where user_id is not null")
    .all() as { user_id: number }[]) {
    voterIds.add(r.user_id);
  }

  // Map V2 user id → new Postgres user id (by hf_id, which is stable & unique).
  const userIdMap = new Map<number, number>();
  let usersCreated = 0;
  for (const v2id of voterIds) {
    const u = v2Users.get(v2id);
    if (!u) continue;
    const joinDate = parseV2Date(u.join_date);
    const hfCreated = u.hf_account_created
      ? parseV2Date(u.hf_account_created)
      : null;
    const inserted = await db
      .insert(users)
      .values({
        username: u.username,
        hfId: u.hf_id,
        joinDate,
        hfAccountCreated: hfCreated,
        // Fresh anti-fraud state — nothing carried from V2.
        trustScore: 100,
        quarantined: false,
        showInLeaderboard: true,
      })
      .onConflictDoUpdate({
        // hf_id is the stable identity; refresh username if it changed.
        target: users.hfId,
        set: { username: u.username },
      })
      .returning({ id: users.id });
    userIdMap.set(v2id, inserted[0].id);
    usersCreated++;
  }
  console.info(`[import-v2] voting users upserted: ${usersCreated}`);

  // ── 4. Insert historical votes (named user + both sides present) ─────────
  const allV2Votes = src.query("select * from vote").all() as V2Vote[];
  let imported = 0;
  let droppedNullUser = 0;
  let droppedMissingModel = 0;
  let droppedExcluded = 0;

  // Insert in batches for speed.
  const BATCH = 500;
  let batch: (typeof votes.$inferInsert)[] = [];
  const flush = async () => {
    if (batch.length === 0) return;
    await db.insert(votes).values(batch);
    imported += batch.length;
    batch = [];
  };

  for (const v of allV2Votes) {
    if (v.user_id == null) {
      droppedNullUser++;
      continue;
    }
    const newUserId = userIdMap.get(v.user_id);
    if (newUserId == null) {
      droppedNullUser++;
      continue;
    }
    // Exclude gamed models (check the raw V2 ids before remap).
    if (
      EXCLUDED_MODEL_IDS.has(v.model_chosen) ||
      EXCLUDED_MODEL_IDS.has(v.model_rejected)
    ) {
      droppedExcluded++;
      continue;
    }
    const chosen = remap(v.model_chosen);
    const rejected = remap(v.model_rejected);
    if (!presentIds.has(chosen) || !presentIds.has(rejected)) {
      droppedMissingModel++;
      continue;
    }
    batch.push({
      userId: newUserId,
      text: v.text ?? "",
      modelType: v.model_type,
      chosenModelId: chosen,
      rejectedModelId: rejected,
      sentenceHash: v.sentence_hash ?? null,
      sentenceOrigin: v.sentence_origin ?? "custom",
      countsForPublic: v.counts_for_public_leaderboard !== 0,
      sessionDurationSeconds: v.session_duration_seconds ?? null,
      createdAt: parseV2Date(v.vote_date),
      // Fresh anti-fraud — no risk score / flags carried over.
      riskScore: 0,
      flagged: false,
    });
    if (batch.length >= BATCH) await flush();
  }
  await flush();

  console.info(
    `[import-v2] votes imported: ${imported} ` +
      `(dropped: ${droppedNullUser} user-less, ${droppedMissingModel} missing-model, ` +
      `${droppedExcluded} excluded-model)`,
  );

  src.close();

  // ── 5. Drop under-threshold legacy models ────────────────────────────────
  // A retired model with too few matches has a meaningless, noisy rating and no
  // future votes to settle it — there's no point carrying it over. (Active
  // models are kept regardless: they still battle and will earn votes; the
  // leaderboard just hides them until they cross the threshold.) Deleting a
  // legacy model also deletes its votes, which is correct — those battles no
  // longer have two ranked sides. We prune iteratively because removing one
  // model's votes can pull another legacy model below the threshold.
  let prunedModels = 0;
  let prunedVotes = 0;
  for (;;) {
    // Counting-vote match count for each retired model (either side). Plain SQL
    // is clearest here: a correlated count over votes per inactive model.
    const counted = await db.execute<{ id: string; n: number }>(sql`
      select m.id as id,
             count(v.id) filter (where v.counts_for_public = true) as n
      from models m
      left join votes v
        on (v.chosen_model_id = m.id or v.rejected_model_id = m.id)
      where m.is_active = false
      group by m.id
    `);
    const rows = (counted as unknown as { rows: { id: string; n: number }[] })
      .rows;
    if (rows.length === 0) break;

    const toDrop = rows
      .filter((c) => Number(c.n) < RANK_THRESHOLD)
      .map((c) => c.id);
    if (toDrop.length === 0) break;

    // Delete their votes first (FK), then the models.
    const del = await db
      .delete(votes)
      .where(
        or(
          inArray(votes.chosenModelId, toDrop),
          inArray(votes.rejectedModelId, toDrop),
        ),
      )
      .returning({ id: votes.id });
    prunedVotes += del.length;
    await db.delete(models).where(inArray(models.id, toDrop));
    prunedModels += toDrop.length;
    console.info(
      `[import-v2] pruned ${toDrop.length} sub-threshold legacy models ` +
        `(${toDrop.join(", ")}) and ${del.length} of their votes`,
    );
  }
  console.info(
    `[import-v2] pruning total: ${prunedModels} legacy models, ${prunedVotes} votes`,
  );

  // ── 6. Replay through Glicko-2 (our live ranking algorithm) ──────────────
  console.info("[import-v2] replaying votes through Glicko-2…");
  const replayed = await recomputeFromCleanVotes();
  console.info(`[import-v2] ratings recomputed from ${replayed} clean votes.`);

  console.info("[import-v2] done.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("[import-v2] FAILED:", err);
    process.exit(1);
  });
