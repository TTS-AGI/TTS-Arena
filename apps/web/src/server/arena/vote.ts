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
  battleSessions,
  consumedSentences,
  models,
  ratingHistory,
  voiceStats,
  votes,
  type ModelRow,
} from "../db/schema";
import type { BattleSession } from "./session-store";
import type { Assessment } from "./security";
import { logSecurityEvent } from "../security/events";

export type VoteResult = {
  chosenModelId: string;
  rejectedModelId: string;
  counted: boolean;
  flagged: boolean;
};

function glickoOf(m: ModelRow): Glicko {
  return { rating: m.rating, rd: m.ratingDeviation, vol: m.volatility };
}

/** Where the vote was cast from, for the cluster sweep. Both may be null. */
export type VoteClient = { ip: string | null; fingerprint: string | null };

export async function recordVote(
  session: BattleSession,
  chosenKey: "a" | "b",
  assessment?: Assessment,
  client?: VoteClient,
): Promise<VoteResult> {
  const chosenSide = session[chosenKey];
  const rejectedSide = session[chosenKey === "a" ? "b" : "a"];

  // Origin was decided at generate time (pool prompt left unchanged = "dataset",
  // otherwise "custom") and carried on the session.
  const origin = session.origin;

  // Public-rating gate: only clean, first-use dataset prompts affect the board.
  // Custom prompt votes are useful for listening/reveal, but not for the
  // benchmark ranking.
  const flagged = assessment?.flag ?? false;
  let counts =
    !flagged && !(assessment?.block ?? false) && origin === "dataset";
  const riskScore = assessment?.riskScore ?? 0;
  const riskReasons = assessment?.reasons.length
    ? JSON.stringify(assessment.reasons)
    : null;

  // One Postgres transaction: mark the session voted, persist the vote, and (if
  // it counts) apply the live Glicko-2 update, append rating history, and bump
  // per-voice stats. node-postgres transactions are async — every statement is
  // awaited.
  let insertedVoteId = 0;
  await db.transaction(async (tx) => {
    // 0. Mark the session voted (idempotency guard lives in the same tx).
    await tx
      .update(battleSessions)
      .set({ voted: true })
      .where(eq(battleSessions.id, session.id));

    // 1. Claim this dataset prompt for public rating. The prompt corpus is
    // large, and each corpus sentence should affect the leaderboard at most
    // once. If another session already consumed it, the vote is stored but does
    // not move ratings.
    if (counts) {
      const claimed = await tx
        .insert(consumedSentences)
        .values({
          sentenceHash: session.sentenceHash,
          sentenceText: session.text.trim(),
        })
        .onConflictDoNothing()
        .returning({ id: consumedSentences.id });
      counts = claimed.length > 0;
    }

    // 2. Persist the vote.
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
        chosenAudioPath: chosenSide.logPath,
        rejectedAudioPath: rejectedSide.logPath,
        sentenceHash: session.sentenceHash,
        sentenceOrigin: origin,
        countsForPublic: counts,
        riskScore,
        riskReasons,
        flagged,
        sessionDurationSeconds: (Date.now() - session.createdAt) / 1000,
        ip: client?.ip ?? null,
        fingerprint: client?.fingerprint ?? null,
      })
      .returning({ id: votes.id });
    const voteId = vote!.id;
    insertedVoteId = voteId;

    if (!counts) return;

    // 3. Live Glicko-2 update for both models.
    const chosenRow = await tx.query.models.findFirst({
      where: eq(models.id, chosenSide.modelId),
    });
    const rejectedRow = await tx.query.models.findFirst({
      where: eq(models.id, rejectedSide.modelId),
    });
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

    // 4. Rating history trail.
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

    // 5. Per-voice stats (win for chosen voice, match for both).
    await upsertVoiceStat(tx, chosenRow.id, chosenSide.voice, true);
    await upsertVoiceStat(tx, rejectedRow.id, rejectedSide.voice, false);
  });

  // Record a security event for flagged/blocked votes (best-effort, async).
  if (flagged && assessment) {
    await logSecurityEvent({
      userId: session.userId,
      kind: assessment.block ? "vote_blocked" : "vote_flagged",
      severity: assessment.block ? "critical" : "warn",
      voteId: insertedVoteId || null,
      detail: { riskScore, reasons: assessment.reasons },
    });
  }

  return {
    chosenModelId: chosenSide.modelId,
    rejectedModelId: rejectedSide.modelId,
    counted: counts,
    flagged,
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
