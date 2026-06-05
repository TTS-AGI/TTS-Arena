/**
 * Leaderboard assembly — a hybrid of two rating systems, each used where it's
 * strongest:
 *
 *   - < ESTABLISHED_THRESHOLD counted votes → live Glicko-2 (stable when data
 *     is sparse), shown as "preliminary".
 *   - >= ESTABLISHED_THRESHOLD               → the Bradley–Terry fit (the
 *     principled global ranking once there's enough data), cached.
 *
 * Both ratings are centered on ~1500, so the single list is sorted by the
 * displayed rating; preliminary rows are badged in the UI.
 */
import { eq } from "drizzle-orm";
import {
  isEstablished,
  tierFor,
  type LeaderboardRow,
  type ModelType,
} from "@ttsa/shared";
import { db } from "../db/client";
import { models } from "../db/schema";
import { getBTRatings } from "./bt-cache";

export async function getLeaderboard(
  type: ModelType,
): Promise<LeaderboardRow[]> {
  const [typeModels, bt] = await Promise.all([
    db.select().from(models).where(eq(models.modelType, type)),
    getBTRatings(type),
  ]);

  // Build each row from the appropriate rating source.
  const rows = typeModels
    .filter((m) => m.matchCount > 0)
    .map((m) => {
      const established = isEstablished(m.matchCount);
      const btRating = bt.get(m.id)?.rating;
      // Established models use BT (fall back to Glicko if BT is somehow
      // missing); preliminary models always use their live Glicko rating.
      const rating =
        established && btRating !== undefined ? btRating : m.rating;
      return {
        id: m.id,
        name: m.name,
        url: m.url ?? "",
        icon: m.icon ?? null,
        elo: Math.round(rating),
        winRate: m.matchCount > 0 ? (m.winCount / m.matchCount) * 100 : 0,
        totalVotes: m.matchCount,
        open: m.isOpen,
        preliminary: !established,
      };
    });

  // One list, sorted by the displayed rating.
  rows.sort((a, b) => b.elo - a.elo);

  return rows.map((r, i) => ({
    rank: i + 1,
    tier: tierFor(i + 1),
    ...r,
  }));
}
