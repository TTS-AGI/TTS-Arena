/**
 * Cached Bradley–Terry fit.
 *
 * BT is a batch computation over all counting votes, so we don't run it on
 * every leaderboard load. Instead we cache the result per model type and
 * recompute only when at least RECOMPUTE_DELTA new counting votes have landed
 * since the last fit (or on the first request).
 */
import { and, eq } from "drizzle-orm";
import { bradleyTerry, type BTRating, type ModelType } from "@ttsa/shared";
import { db } from "../db/client";
import { models, votes } from "../db/schema";

const RECOMPUTE_DELTA = 50;

type Entry = { voteCount: number; ratings: Map<string, BTRating> };
const cache = new Map<ModelType, Entry>();

async function countingVotes(type: ModelType): Promise<number> {
  const rows = await db
    .select({ c: votes.id })
    .from(votes)
    .where(and(eq(votes.modelType, type), eq(votes.countsForPublic, true)));
  return rows.length;
}

/**
 * BT ratings for a model type, keyed by model id. Recomputed only when the
 * counting-vote count has grown by >= RECOMPUTE_DELTA since the cached fit.
 */
export async function getBTRatings(
  type: ModelType,
): Promise<Map<string, BTRating>> {
  const total = await countingVotes(type);
  const cached = cache.get(type);
  if (cached && total - cached.voteCount < RECOMPUTE_DELTA) {
    return cached.ratings;
  }

  const outcomes = await db
    .select({ winner: votes.chosenModelId, loser: votes.rejectedModelId })
    .from(votes)
    .where(and(eq(votes.modelType, type), eq(votes.countsForPublic, true)));

  const ids = (
    await db
      .select({ id: models.id })
      .from(models)
      .where(eq(models.modelType, type))
  ).map((r) => r.id);

  const ratings = new Map(
    bradleyTerry(ids, outcomes, 100).map((r) => [r.id, r]),
  );
  cache.set(type, { voteCount: total, ratings });
  return ratings;
}
