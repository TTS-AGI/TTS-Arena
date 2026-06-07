/**
 * Leaderboard assembly.
 *
 * Every ranked model is placed by the SAME Bradley–Terry fit — one calibrated
 * global ranking over all pairwise outcomes, including low-data models. BT's
 * bootstrap CI naturally widens when a model has few games, so we DISPLAY the
 * point rating but RANK by the CI lower bound: a model can't top the board on a
 * lucky small sample, it must be both good AND certain. The ± uncertainty is
 * surfaced so the provisional→settled story shows.
 *
 * We used to split the board — Glicko-2 below ESTABLISHED_THRESHOLD votes, BT
 * above — but that put two uncalibrated scales on one list, producing jarring
 * gaps (a 216-vote model's Glicko number sitting well above the BT numbers it
 * was listed against). One BT fit for everyone removes that seam. Glicko's live
 * rating/RD is kept only as a fallback if BT is somehow missing a model, and the
 * `preliminary` flag still badges models under the establishment threshold.
 */
import { eq } from "drizzle-orm";
import {
  conservativeRating,
  isEstablished,
  isRanked,
  tierFor,
  type LeaderboardRow,
  type ModelType,
} from "@ttsa/shared";
import { db } from "../db/client";
import { models } from "../db/schema";
import { getBTRatings } from "./bt-cache";

export async function getLeaderboard(
  type: ModelType,
  includePreliminary = false,
): Promise<LeaderboardRow[]> {
  const [typeModels, bt] = await Promise.all([
    db.select().from(models).where(eq(models.modelType, type)),
    getBTRatings(type),
  ]);

  // By default, only models past RANK_THRESHOLD votes are shown — below it the
  // rating is too noisy to be meaningful. When includePreliminary is set (the
  // "show new models" toggle), the floor drops to any model with at least one
  // counted match, so freshly-added models are discoverable right away (still
  // badged "Preliminary" until they cross the establishment threshold).
  const floor = (m: (typeof typeModels)[number]) =>
    includePreliminary ? m.matchCount > 0 : isRanked(m.matchCount);
  const rows = typeModels.filter(floor).map((m) => {
    const btr = bt.get(m.id);

    // Display rating + ranking lower bound + ± uncertainty. Prefer the single
    // BT fit for everyone (rank by its CI lower bound); fall back to live
    // Glicko (rating − 2·RD) only if BT somehow lacks this model.
    let rating: number;
    let lowerBound: number;
    let uncertainty: number;
    if (btr !== undefined) {
      rating = btr.rating;
      lowerBound = btr.ciLow;
      uncertainty = Math.round((btr.ciHigh - btr.ciLow) / 2);
    } else {
      rating = m.rating;
      lowerBound = conservativeRating({
        rating: m.rating,
        rd: m.ratingDeviation,
        vol: m.volatility,
      });
      uncertainty = Math.round(2 * m.ratingDeviation);
    }

    return {
      id: m.id,
      name: m.name,
      url: m.url ?? "",
      icon: m.icon ?? null,
      elo: Math.round(rating),
      lowerBound,
      uncertainty,
      winRate: m.matchCount > 0 ? (m.winCount / m.matchCount) * 100 : 0,
      totalVotes: m.matchCount,
      open: m.isOpen,
      preliminary: !isEstablished(m.matchCount),
      active: m.isActive,
    };
  });

  // Rank by the conservative lower bound (good AND certain), then strip it —
  // it's an internal sort key, not part of the public row.
  rows.sort((a, b) => b.lowerBound - a.lowerBound);

  return rows.map((row, i) => {
    const { lowerBound, ...r } = row;
    void lowerBound;
    return { rank: i + 1, tier: tierFor(i + 1), ...r };
  });
}
