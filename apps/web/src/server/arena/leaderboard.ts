/**
 * Leaderboard assembly.
 *
 * Live ratings come from the Glicko-2 state on each model row (cheap, current).
 * The canonical ordering is a Bradley–Terry fit over all public outcomes with
 * bootstrap CIs, ranked by the CI lower bound — so a model shows up early (with
 * a wide interval) and "finalizes" as its interval tightens with more votes.
 */
import { and, eq } from "drizzle-orm";
import {
  bradleyTerry,
  tierFor,
  type LeaderboardRow,
  type ModelType,
  type Outcome,
} from "@ttsa/shared";
import { db } from "../db/client";
import { models, votes } from "../db/schema";

export async function getLeaderboard(
  type: ModelType,
): Promise<LeaderboardRow[]> {
  // Public outcomes for this model type.
  const outcomes = await db
    .select({
      winner: votes.chosenModelId,
      loser: votes.rejectedModelId,
    })
    .from(votes)
    .where(and(eq(votes.modelType, type), eq(votes.countsForPublic, true)));

  const typeModels = await db
    .select()
    .from(models)
    .where(eq(models.modelType, type));
  const byId = new Map(typeModels.map((m) => [m.id, m]));
  const ids = typeModels.map((m) => m.id);

  const bt = bradleyTerry(ids, outcomes as Outcome[], 100);

  // Only surface models with at least one counted match; the CI conveys
  // confidence rather than a hard vote cutoff.
  const rows: LeaderboardRow[] = [];
  let rank = 0;
  for (const r of bt) {
    const m = byId.get(r.id);
    if (!m || m.matchCount === 0) continue;
    rank += 1;
    rows.push({
      rank,
      id: m.id,
      name: m.name,
      url: m.url ?? "",
      elo: Math.round(m.rating),
      winRate: m.matchCount > 0 ? (m.winCount / m.matchCount) * 100 : 0,
      totalVotes: m.matchCount,
      tier: tierFor(rank),
      open: m.isOpen,
    });
  }
  return rows;
}
