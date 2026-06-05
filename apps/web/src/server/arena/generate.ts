/**
 * Battle generation: pick two anonymous models *from the router catalog*
 * (enabled + available), synthesize both via the router concurrently, and store
 * a server-side session. The caller returns only the opaque session id + audio
 * URLs, never identities.
 */
import type { ArenaModelDTO, ModelType } from "@ttsa/shared";
import { db } from "../db/client";
import { votes } from "../db/schema";
import { synthesize } from "../router-client";
import { getCatalog } from "./catalog";
import { createSession, type BattleSession } from "./session-store";
import { hashSentence } from "./sentences";

const SMOOTHING = 500;

/** Appearance counts per model id (chosen or rejected) for weighted selection. */
async function appearanceCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({ chosen: votes.chosenModelId, rejected: votes.rejectedModelId })
    .from(votes);
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.chosen] = (counts[r.chosen] ?? 0) + 1;
    counts[r.rejected] = (counts[r.rejected] ?? 0) + 1;
  }
  return counts;
}

/**
 * Weighted pick of two distinct models from `pool`, favouring under-exposed
 * ones (weight = 1 / (appearances + SMOOTHING)).
 */
function weightedPickTwo(
  pool: ArenaModelDTO[],
  counts: Record<string, number>,
): [ArenaModelDTO, ArenaModelDTO] {
  if (pool.length < 2) {
    throw new Error("Need at least 2 available models for a battle");
  }
  const pick = (from: ArenaModelDTO[]): ArenaModelDTO => {
    const weights = from.map((m) => 1 / ((counts[m.id] ?? 0) + SMOOTHING));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < from.length; i++) {
      r -= weights[i]!;
      if (r <= 0) return from[i]!;
    }
    return from[from.length - 1]!;
  };
  const a = pick(pool);
  const b = pick(pool.filter((m) => m.id !== a.id));
  return [a, b];
}

export async function generateBattle(params: {
  userId: number;
  modelType: ModelType;
  text: string;
}): Promise<BattleSession> {
  const { userId, modelType, text } = params;

  const catalog = await getCatalog();
  if (catalog.length < 2) {
    throw new Error("Not enough models are available right now");
  }

  const [modelA, modelB] = weightedPickTwo(catalog, await appearanceCounts());

  const [synthA, synthB] = await Promise.all([
    synthesize({
      text,
      provider: modelA.provider,
      model: modelA.routerModel,
      includeRaw: true,
    }),
    synthesize({
      text,
      provider: modelB.provider,
      model: modelB.routerModel,
      includeRaw: true,
    }),
  ]);

  return createSession({
    userId,
    modelType,
    text,
    sentenceHash: hashSentence(text),
    a: {
      modelId: modelA.id,
      voice: synthA.voice,
      audio: synthA.audio,
      extension: synthA.extension,
      rawAudio: synthA.raw,
    },
    b: {
      modelId: modelB.id,
      voice: synthB.voice,
      audio: synthB.audio,
      extension: synthB.extension,
      rawAudio: synthB.raw,
    },
  });
}
