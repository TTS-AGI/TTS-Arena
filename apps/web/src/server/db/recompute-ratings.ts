/**
 * Recompute every model's live Glicko-2 rating from scratch by replaying all
 * *clean* counting votes in chronological order — votes with
 * countsForPublic=true whose author isn't quarantined. Use after a bulk data
 * change (backfill, retro-flagging by the security sweep, or a manual flag) so
 * live ratings reflect only legitimate votes. Resets win/match counters too.
 * Idempotent.
 *
 * Run with: bun run src/server/db/recompute-ratings.ts
 */
import { and, asc, eq } from "drizzle-orm";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
  glickoUpdate,
  type Glicko,
} from "@ttsa/shared";
import { db } from "./client";
import { models, users, votes } from "./schema";

/** Replay clean votes and rewrite live ratings + counters. Returns vote count. */
export async function recomputeFromCleanVotes(): Promise<number> {
  const allModels = await db.select().from(models);
  const state = new Map<string, Glicko & { wins: number; matches: number }>(
    allModels.map((m) => [
      m.id,
      {
        rating: DEFAULT_RATING,
        rd: DEFAULT_RD,
        vol: DEFAULT_VOL,
        wins: 0,
        matches: 0,
      },
    ]),
  );

  // Clean = counts for public AND author not quarantined.
  const counting = await db
    .select({
      chosenModelId: votes.chosenModelId,
      rejectedModelId: votes.rejectedModelId,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .where(and(eq(votes.countsForPublic, true), eq(users.quarantined, false)))
    .orderBy(asc(votes.createdAt), asc(votes.id));

  for (const v of counting) {
    const win = state.get(v.chosenModelId);
    const lose = state.get(v.rejectedModelId);
    if (!win || !lose) continue;

    const winBefore: Glicko = { rating: win.rating, rd: win.rd, vol: win.vol };
    const loseBefore: Glicko = {
      rating: lose.rating,
      rd: lose.rd,
      vol: lose.vol,
    };
    const winAfter = glickoUpdate(winBefore, [
      { opponent: loseBefore, score: 1 },
    ]);
    const loseAfter = glickoUpdate(loseBefore, [
      { opponent: winBefore, score: 0 },
    ]);

    Object.assign(win, winAfter);
    win.wins += 1;
    win.matches += 1;
    Object.assign(lose, loseAfter);
    lose.matches += 1;
  }

  for (const [id, s] of state) {
    await db
      .update(models)
      .set({
        rating: s.rating,
        ratingDeviation: s.rd,
        volatility: s.vol,
        winCount: s.wins,
        matchCount: s.matches,
        updatedAt: new Date(),
      })
      .where(eq(models.id, id));
  }

  return counting.length;
}

// CLI entry: only run when executed directly (not when imported by the sweep).
if (import.meta.main) {
  recomputeFromCleanVotes()
    .then((n) => {
      console.info(`Recomputed ratings from ${n} clean votes.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
