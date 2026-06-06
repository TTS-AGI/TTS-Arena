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
import { db, withWriteRetry } from "../db/client";
import {
  battleSessions,
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

export async function recordVote(
  session: BattleSession,
  chosenKey: "a" | "b",
  assessment?: Assessment,
): Promise<VoteResult> {
  const chosenSide = session[chosenKey];
  const rejectedSide = session[chosenKey === "a" ? "b" : "a"];

  // Origin was decided at generate time (pool prompt left unchanged = "dataset",
  // otherwise "custom") and carried on the session.
  const origin = session.origin;

  // Anti-fraud gate: a flagged (or blocked) vote is still stored, but does NOT
  // count toward public ratings — the rating math below is skipped entirely.
  const flagged = assessment?.flag ?? false;
  const counts = !flagged && !(assessment?.block ?? false);
  const riskScore = assessment?.riskScore ?? 0;
  const riskReasons = assessment?.reasons.length
    ? JSON.stringify(assessment.reasons)
    : null;

  // The SQLite driver (bun:sqlite / better-sqlite3) is synchronous, so the
  // transaction callback must be synchronous too — no `await` inside, or the
  // driver throws ("custom formatter threw an exception"). All reads/writes
  // here run synchronously via the sync query builders.
  //
  // Wrapped in withWriteRetry because bun:sqlite doesn't wait on a held write
  // lock; the whole vote (mark-voted + rating updates) is one transaction so a
  // retry re-runs atomically.
  let insertedVoteId = 0;
  await withWriteRetry(() =>
    db.transaction((tx) => {
      // 0. Mark the session voted (idempotency guard lives in the same tx).
      tx.update(battleSessions)
        .set({ voted: true })
        .where(eq(battleSessions.id, session.id))
        .run();

      // 1. Persist the vote.
      const [vote] = tx
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
        })
        .returning({ id: votes.id })
        .all();
      const voteId = vote!.id;
      insertedVoteId = voteId;

      if (!counts) return;

      // 2. Live Glicko-2 update for both models.
      const chosenRow = tx.query.models
        .findFirst({ where: eq(models.id, chosenSide.modelId) })
        .sync();
      const rejectedRow = tx.query.models
        .findFirst({ where: eq(models.id, rejectedSide.modelId) })
        .sync();
      if (!chosenRow || !rejectedRow) return;

      const chosenBefore = glickoOf(chosenRow);
      const rejectedBefore = glickoOf(rejectedRow);
      const chosenAfter = glickoUpdate(chosenBefore, [
        { opponent: rejectedBefore, score: 1 },
      ]);
      const rejectedAfter = glickoUpdate(rejectedBefore, [
        { opponent: chosenBefore, score: 0 },
      ]);

      tx.update(models)
        .set({
          rating: chosenAfter.rating,
          ratingDeviation: chosenAfter.rd,
          volatility: chosenAfter.vol,
          winCount: chosenRow.winCount + 1,
          matchCount: chosenRow.matchCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(models.id, chosenRow.id))
        .run();
      tx.update(models)
        .set({
          rating: rejectedAfter.rating,
          ratingDeviation: rejectedAfter.rd,
          volatility: rejectedAfter.vol,
          matchCount: rejectedRow.matchCount + 1,
          updatedAt: new Date(),
        })
        .where(eq(models.id, rejectedRow.id))
        .run();

      // 3. Rating history trail.
      tx.insert(ratingHistory)
        .values([
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
        ])
        .run();

      // 4. Per-voice stats (win for chosen voice, match for both).
      upsertVoiceStat(tx, chosenRow.id, chosenSide.voice, true);
      upsertVoiceStat(tx, rejectedRow.id, rejectedSide.voice, false);
    }),
  );

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

/** Increment a (model, voice) stat row, creating it if needed (synchronous). */
function upsertVoiceStat(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  modelId: string,
  voice: string,
  won: boolean,
): void {
  tx.insert(voiceStats)
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
    })
    .run();
}
