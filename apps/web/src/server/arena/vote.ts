/**
 * Recording a vote — the one place ratings change.
 *
 * On a binary choice we: persist the vote, classify whether it counts for the
 * public board (dataset prompt, not previously consumed), and if so apply a
 * live Glicko-2 update to both models, append rating history, bump per-voice
 * stats, and mark the sentence consumed. All in one transaction.
 */
import { eq, sql } from "drizzle-orm";
import { glickoUpdate, type Glicko } from "@ttsa/shared";
import { db } from "../db/client";
import {
  models,
  ratingHistory,
  voiceStats,
  votes,
  type ModelRow,
} from "../db/schema";
import { isDatasetPrompt, markConsumed, isConsumed } from "./sentences";
import type { BattleSession } from "./session-store";

export type VoteResult = {
  chosenModelId: string;
  rejectedModelId: string;
  counted: boolean;
};

function glickoOf(m: ModelRow): Glicko {
  return { rating: m.rating, rd: m.ratingDeviation, vol: m.volatility };
}

export async function recordVote(
  session: BattleSession,
  chosenKey: "a" | "b",
): Promise<VoteResult> {
  const chosenSide = session[chosenKey];
  const rejectedSide = session[chosenKey === "a" ? "b" : "a"];

  const origin = isDatasetPrompt(session.text) ? "dataset" : "custom";
  const counts =
    origin === "dataset" ? !(await isConsumed(session.text)) : false;

  await db.transaction(async (tx) => {
    // 1. Persist the vote.
    const [vote] = await tx
      .insert(votes)
      .values({
        userId: session.userId,
        text: session.text,
        modelType: session.modelType,
        chosenModelId: chosenSide.modelId,
        rejectedModelId: rejectedSide.modelId,
        chosenVoice: chosenSide.voice,
        rejectedVoice: rejectedSide.voice,
        sentenceHash: session.sentenceHash,
        sentenceOrigin: origin,
        countsForPublic: counts,
        sessionDurationSeconds: (Date.now() - session.createdAt) / 1000,
      })
      .returning({ id: votes.id });
    const voteId = vote!.id;

    if (!counts) return;

    // 2. Live Glicko-2 update for both models.
    const [chosenRow, rejectedRow] = await Promise.all([
      tx.query.models.findFirst({ where: eq(models.id, chosenSide.modelId) }),
      tx.query.models.findFirst({ where: eq(models.id, rejectedSide.modelId) }),
    ]);
    if (!chosenRow || !rejectedRow) return;

    const chosenBefore = glickoOf(chosenRow);
    const rejectedBefore = glickoOf(rejectedRow);
    const chosenAfter = glickoUpdate(chosenBefore, [
      { opponent: rejectedBefore, score: 1 },
    ]);
    const rejectedAfter = glickoUpdate(rejectedBefore, [
      { opponent: chosenBefore, score: 0 },
    ]);

    await tx
      .update(models)
      .set({
        rating: chosenAfter.rating,
        ratingDeviation: chosenAfter.rd,
        volatility: chosenAfter.vol,
        winCount: chosenRow.winCount + 1,
        matchCount: chosenRow.matchCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(models.id, chosenRow.id));
    await tx
      .update(models)
      .set({
        rating: rejectedAfter.rating,
        ratingDeviation: rejectedAfter.rd,
        volatility: rejectedAfter.vol,
        matchCount: rejectedRow.matchCount + 1,
        updatedAt: new Date(),
      })
      .where(eq(models.id, rejectedRow.id));

    // 3. Rating history trail.
    await tx.insert(ratingHistory).values([
      {
        modelId: chosenRow.id,
        modelType: session.modelType,
        rating: chosenAfter.rating,
        ratingDeviation: chosenAfter.rd,
        voteId,
      },
      {
        modelId: rejectedRow.id,
        modelType: session.modelType,
        rating: rejectedAfter.rating,
        ratingDeviation: rejectedAfter.rd,
        voteId,
      },
    ]);

    // 4. Per-voice stats (win for chosen voice, match for both).
    await upsertVoiceStat(tx, chosenRow.id, chosenSide.voice, true);
    await upsertVoiceStat(tx, rejectedRow.id, rejectedSide.voice, false);
  });

  if (counts && origin === "dataset") {
    await markConsumed(session.text);
  }

  return {
    chosenModelId: chosenSide.modelId,
    rejectedModelId: rejectedSide.modelId,
    counted: counts,
  };
}

/** Increment a (model, voice) stat row, creating it if needed. */
async function upsertVoiceStat(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  modelId: string,
  voice: string,
  won: boolean,
): Promise<void> {
  await tx
    .insert(voiceStats)
    .values({
      modelId,
      voice,
      winCount: won ? 1 : 0,
      matchCount: 1,
    })
    .onConflictDoUpdate({
      target: [voiceStats.modelId, voiceStats.voice],
      set: {
        winCount: sql`${voiceStats.winCount} + ${won ? 1 : 0}`,
        matchCount: sql`${voiceStats.matchCount} + 1`,
        updatedAt: new Date(),
      },
    });
}
