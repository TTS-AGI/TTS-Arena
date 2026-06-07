/**
 * Generation timing observability — one row per model synthesis attempt, so the
 * admin panel can answer "how long does a gen take" (per-model P50/P95 latency),
 * success rate, and throughput over time. Best-effort like the error logger:
 * never throws (a logging failure must not fail a generation).
 */
import { and, lt, sql } from "drizzle-orm";
import { db, withWriteRetry } from "../db/client";
import { generationEvents } from "../db/schema";

const MAX_ERROR = 1000;

export async function logGenerationEvent(e: {
  provider: string;
  model: string;
  routerModel?: string | null;
  durationMs: number;
  success: boolean;
  audioBytes?: number;
  textLength?: number | null;
  status?: number | null;
  error?: string | null;
  userId?: number | null;
}): Promise<void> {
  try {
    await withWriteRetry(() =>
      db.insert(generationEvents).values({
        provider: e.provider,
        model: e.model,
        routerModel: e.routerModel ?? null,
        durationMs: Math.max(0, Math.round(e.durationMs)),
        success: e.success,
        audioBytes: e.audioBytes ?? 0,
        textLength: e.textLength ?? null,
        status: e.status ?? null,
        error: e.error ? e.error.slice(0, MAX_ERROR) : null,
        userId: e.userId ?? null,
      }),
    );
  } catch {
    // Non-critical — never let timing logging break a generation.
  }
}

/* ── Retention ────────────────────────────────────────────────────────── */

const RETENTION_DAYS = Number(process.env.GENERATION_RETENTION_DAYS ?? 30);
const HARD_CAP = 200_000;

/** Delete generation events older than the retention window; trim to the cap. */
export async function pruneGenerationEvents(): Promise<number> {
  let removed = 0;
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000);
    const byAge = await withWriteRetry(() =>
      db
        .delete(generationEvents)
        .where(lt(generationEvents.createdAt, cutoff))
        .returning({ id: generationEvents.id }),
    );
    removed += byAge.length;

    const countRows = await db
      .select({ c: sql<number>`count(*)` })
      .from(generationEvents);
    const total = countRows[0]?.c ?? 0;
    if (total > HARD_CAP) {
      const overflow = total - HARD_CAP;
      const oldest = await db
        .select({ id: generationEvents.id })
        .from(generationEvents)
        .orderBy(generationEvents.createdAt)
        .limit(overflow);
      const ids = oldest.map((r) => r.id);
      if (ids.length) {
        await withWriteRetry(() =>
          db.delete(generationEvents).where(
            and(
              sql`${generationEvents.id} in (${sql.join(
                ids.map((i) => sql`${i}`),
                sql`, `,
              )})`,
            ),
          ),
        );
        removed += ids.length;
      }
    }
  } catch {
    // Best-effort.
  }
  return removed;
}
