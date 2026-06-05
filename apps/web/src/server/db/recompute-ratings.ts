/**
 * Recompute every model's live Glicko-2 rating from scratch by replaying all
 * counting votes in chronological order. Use after a bulk data change (e.g.
 * backfilling votes) so live ratings aren't stale. Also resets win/match
 * counters to match. Idempotent.
 *
 * Run with: bun run src/server/db/recompute-ratings.ts
 */
import { asc, eq } from "drizzle-orm";
import {
  DEFAULT_RATING,
  DEFAULT_RD,
  DEFAULT_VOL,
  glickoUpdate,
  type Glicko,
} from "@ttsa/shared";
import { db } from "./client";
import { models, votes } from "./schema";

async function recompute() {
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

  const counting = await db
    .select()
    .from(votes)
    .where(eq(votes.countsForPublic, true))
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

  console.info(`Recomputed ratings from ${counting.length} counting votes.`);
}

recompute()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
