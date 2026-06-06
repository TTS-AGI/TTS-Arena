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
import { getCatalog, ensureModelsSeeded } from "./catalog";
import { createSession, type BattleSession } from "./session-store";
import { hashSentence } from "./sentences";
import { errInfo, logErrorEvent } from "../observability/errors";
import { logGenerationEvent } from "../observability/generation";

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
  /** "dataset" if the prompt came unchanged from the pool, else "custom". */
  origin: "dataset" | "custom";
}): Promise<BattleSession> {
  const { userId, modelType, text, origin } = params;

  const catalog = await getCatalog();
  if (catalog.length < 2) {
    throw new Error("Not enough models are available right now");
  }

  // Make sure the catalog models exist in the DB before a vote can FK to them.
  // The router is the catalog's source of truth, but ratings live here, so the
  // roster can drift from the last seed — sync it now.
  await ensureModelsSeeded(catalog);

  const counts = await appearanceCounts();

  // Synthesize a single model, tagging failures with which model failed so we
  // can drop it and retry with another. Each attempt is timed and recorded for
  // latency/throughput observability (success and failure alike).
  const synthOne = async (m: ArenaModelDTO) => {
    const start = Date.now();
    try {
      const out = await synthesize({
        text,
        provider: m.provider,
        model: m.routerModel,
        includeRaw: true,
      });
      void logGenerationEvent({
        provider: m.provider,
        model: m.id,
        routerModel: m.routerModel,
        durationMs: Date.now() - start,
        success: true,
        audioBytes: out.audio.length,
        textLength: text.length,
        userId,
      });
      return { model: m, synth: out };
    } catch (err) {
      void logGenerationEvent({
        provider: m.provider,
        model: m.id,
        routerModel: m.routerModel,
        durationMs: Date.now() - start,
        success: false,
        textLength: text.length,
        error: errInfo(err).message,
        userId,
      });
      throw new ModelSynthError(m, err);
    }
  };

  // Pick two models and synthesize both. If a model fails, exclude it and retry
  // with a fresh pick from the remaining pool, so one broken model/provider
  // doesn't fail every battle it would have appeared in.
  const broken = new Set<string>();
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const pool = catalog.filter((m) => !broken.has(m.id));
    if (pool.length < 2) break;
    const [modelA, modelB] = weightedPickTwo(pool, counts);
    const results = await Promise.allSettled([
      synthOne(modelA),
      synthOne(modelB),
    ]);

    for (const r of results) {
      if (r.status === "rejected" && r.reason instanceof ModelSynthError) {
        broken.add(r.reason.model.id);
        lastErr = r.reason.failure;
        const info = errInfo(r.reason.failure);
        console.error("[generate] model synthesis failed, will retry", {
          modelId: r.reason.model.id,
          provider: r.reason.model.provider,
          error: info.message,
        });
        void logErrorEvent({
          source: "model_synth",
          message: info.message,
          stack: info.stack,
          provider: r.reason.model.provider,
          model: r.reason.model.id,
          userId,
          detail: { routerModel: r.reason.model.routerModel },
        });
      }
    }

    if (
      results[0].status === "fulfilled" &&
      results[1].status === "fulfilled"
    ) {
      const a = results[0].value;
      const b = results[1].value;
      return createSession({
        userId,
        modelType,
        text,
        origin,
        sentenceHash: hashSentence(text),
        a: {
          modelId: a.model.id,
          voice: a.synth.voice,
          audio: a.synth.audio,
          extension: a.synth.extension,
          rawAudio: a.synth.raw,
        },
        b: {
          modelId: b.model.id,
          voice: b.synth.voice,
          audio: b.synth.audio,
          extension: b.synth.extension,
          rawAudio: b.synth.raw,
        },
      });
    }
  }

  throw new Error(
    `Could not synthesize a battle after retries${
      lastErr instanceof Error ? `: ${lastErr.message}` : ""
    }`,
  );
}

/** Wraps a synthesis failure with the model that failed, for retry logic. */
class ModelSynthError extends Error {
  constructor(
    readonly model: ArenaModelDTO,
    readonly failure: unknown,
  ) {
    super(`synthesis failed for ${model.id}`);
    this.name = "ModelSynthError";
  }
}
