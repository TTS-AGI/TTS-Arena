/**
 * "Test All" runner. An admin kicks off a run; we synthesize one fixed sentence
 * for every catalog model, recording pass/fail + latency and writing each clip
 * to disk so it can be auditioned while the run is in flight.
 *
 * Runs in-process in the background (the HF Space is a single Node process — no
 * job queue). State lives entirely in the DB (test_runs + test_results) so the
 * admin can leave and come back, watch live, and browse history. Resumable: one
 * pending row per model is created up front; the loop drains them, and on boot
 * any run left "running" (process restarted mid-run) is resumed.
 */
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db, withWriteRetry } from "../db/client";
import { testRuns, testResults } from "../db/schema";
import { getCatalog, ensureModelsSeeded } from "../arena/catalog";
import { synthesize } from "../router-client";
import { errInfo } from "../observability/errors";

const TEST_SENTENCE =
  "The quick brown fox jumps over the lazy dog near the riverbank.";

const AUDIO_DIR = resolve(
  process.env.AUDIO_CACHE_DIR ?? ".audio-cache",
  "tests",
);

/** Models currently being processed, to avoid double-running a run. */
const activeRuns = new Set<number>();

function audioFile(runId: number, model: string, ext: string): string {
  // model ids can contain slashes? They're arena slugs (safe), but sanitize.
  const safe = model.replace(/[^a-zA-Z0-9._-]/g, "_");
  return join(AUDIO_DIR, `${runId}-${safe}.${ext}`);
}

/** Relative path stored in the DB + used by the audio route. */
function relAudioPath(runId: number, model: string, ext: string): string {
  const safe = model.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${runId}-${safe}.${ext}`;
}

export function testAudioAbsPath(rel: string): string {
  // Guard against path traversal — only a bare filename is expected.
  const safe = rel.replace(/[/\\]/g, "");
  return join(AUDIO_DIR, safe);
}

/**
 * Start a new run: snapshot the catalog, create the run + one pending result
 * per model, then kick the background drainer. Returns the run id immediately.
 */
export async function startTestRun(startedBy?: string): Promise<number> {
  const catalog = await getCatalog();
  await ensureModelsSeeded(catalog);

  const runId = await withWriteRetry(() =>
    db
      .insert(testRuns)
      .values({
        status: "running",
        sentence: TEST_SENTENCE,
        total: catalog.length,
        startedBy: startedBy ?? null,
      })
      .returning({ id: testRuns.id }),
  ).then((r) => r[0]!.id);

  if (catalog.length > 0) {
    await withWriteRetry(() =>
      db
        .insert(testResults)
        .values(
          catalog.map((m) => ({
            runId,
            model: m.id,
            modelName: m.name,
            provider: m.provider,
            status: "pending" as const,
          })),
        )
        .run(),
    );
  }

  void drainRun(runId);
  return runId;
}

/** Synthesize the test sentence for one result row, recording the outcome. */
async function runOne(runId: number, resultId: number): Promise<boolean> {
  const row = await db.query.testResults.findFirst({
    where: eq(testResults.id, resultId),
  });
  if (!row) return false;

  // Mark running.
  await withWriteRetry(() =>
    db
      .update(testResults)
      .set({ status: "running", updatedAt: new Date() })
      .where(eq(testResults.id, resultId))
      .run(),
  );

  // We need the provider + routerModel; resolve from the live catalog.
  const catalog = await getCatalog();
  const dto = catalog.find((m) => m.id === row.model);

  const start = Date.now();
  try {
    if (!dto) throw new Error("model no longer in catalog");
    const out = await synthesize({
      text: TEST_SENTENCE,
      provider: dto.provider,
      model: dto.routerModel,
    });
    const rel = relAudioPath(runId, row.model, out.extension);
    await mkdir(AUDIO_DIR, { recursive: true });
    await writeFile(audioFile(runId, row.model, out.extension), out.audio);
    await withWriteRetry(() =>
      db
        .update(testResults)
        .set({
          status: "pass",
          durationMs: Date.now() - start,
          audioPath: rel,
          extension: out.extension,
          error: null,
          updatedAt: new Date(),
        })
        .where(eq(testResults.id, resultId))
        .run(),
    );
    return true;
  } catch (err) {
    await withWriteRetry(() =>
      db
        .update(testResults)
        .set({
          status: "fail",
          durationMs: Date.now() - start,
          error: errInfo(err).message.slice(0, 1000),
          updatedAt: new Date(),
        })
        .where(eq(testResults.id, resultId))
        .run(),
    );
    return false;
  }
}

/** Drain all pending/running results for a run, then finalize it. */
async function drainRun(runId: number): Promise<void> {
  if (activeRuns.has(runId)) return;
  activeRuns.add(runId);
  try {
    // Reset any "running" rows orphaned by a restart back to pending.
    await withWriteRetry(() =>
      db
        .update(testResults)
        .set({ status: "pending" })
        .where(
          and(eq(testResults.runId, runId), eq(testResults.status, "running")),
        )
        .run(),
    );

    for (;;) {
      const next = await db.query.testResults.findFirst({
        where: and(
          eq(testResults.runId, runId),
          eq(testResults.status, "pending"),
        ),
      });
      if (!next) break;
      await runOne(runId, next.id);
      await refreshRunCounts(runId);
    }

    await finalizeRun(runId);
  } finally {
    activeRuns.delete(runId);
  }
}

/** Recompute completed/passed/failed counts on the run from its results. */
async function refreshRunCounts(runId: number): Promise<void> {
  const rows = await db
    .select({ status: testResults.status, c: sql<number>`count(*)` })
    .from(testResults)
    .where(eq(testResults.runId, runId))
    .groupBy(testResults.status);
  const by = new Map(rows.map((r) => [r.status, r.c]));
  const passed = by.get("pass") ?? 0;
  const failed = by.get("fail") ?? 0;
  await withWriteRetry(() =>
    db
      .update(testRuns)
      .set({ completed: passed + failed, passed, failed })
      .where(eq(testRuns.id, runId))
      .run(),
  );
}

async function finalizeRun(runId: number): Promise<void> {
  await refreshRunCounts(runId);
  await withWriteRetry(() =>
    db
      .update(testRuns)
      .set({ status: "done", finishedAt: new Date() })
      .where(eq(testRuns.id, runId))
      .run(),
  );
}

/**
 * On boot, resume any run left "running" (the process restarted mid-run). Audio
 * written before the restart is gone (temporary by design); rows that were
 * mid-flight get re-run. Best-effort.
 */
export async function resumeInterruptedTestRuns(): Promise<void> {
  try {
    const running = await db
      .select({ id: testRuns.id })
      .from(testRuns)
      .where(eq(testRuns.status, "running"));
    for (const r of running) void drainRun(r.id);
  } catch {
    // Best-effort.
  }
}

/** Delete a run's audio files from disk (best-effort). */
export async function deleteRunAudio(runId: number): Promise<void> {
  const rows = await db
    .select({ audioPath: testResults.audioPath })
    .from(testResults)
    .where(
      and(eq(testResults.runId, runId), inArray(testResults.status, ["pass"])),
    );
  await Promise.all(
    rows
      .map((r) => r.audioPath)
      .filter((p): p is string => !!p)
      .map((p) => rm(testAudioAbsPath(p), { force: true }).catch(() => {})),
  );
}
