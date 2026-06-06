/**
 * DB-backed error logging — every caught error is persisted to error_events so
 * the admin panel can trend failures over time and see which models/providers
 * fail most. Mirrors security/events.ts: best-effort, never throws (a logging
 * failure must not mask the original error).
 */
import { and, lt, sql } from "drizzle-orm";
import { db, withWriteRetry } from "../db/client";
import { errorEvents } from "../db/schema";

export type ErrorSeverity = "warn" | "error" | "fatal";

const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;
const MAX_DETAIL = 8000;

/** Normalize an unknown thrown value into a message + stack. */
export function errInfo(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return { message: err.message, stack: err.stack };
  }
  return { message: String(err) };
}

export async function logErrorEvent(e: {
  source: string;
  message: string;
  severity?: ErrorSeverity;
  stack?: string | null;
  route?: string | null;
  method?: string | null;
  provider?: string | null;
  model?: string | null;
  status?: number | null;
  userId?: number | null;
  detail?: unknown;
}): Promise<void> {
  try {
    const detail =
      e.detail === undefined || e.detail === null
        ? null
        : JSON.stringify(e.detail).slice(0, MAX_DETAIL);
    await withWriteRetry(() =>
      db
        .insert(errorEvents)
        .values({
          source: e.source,
          severity: e.severity ?? "error",
          message: e.message.slice(0, MAX_MESSAGE),
          stack: e.stack ? e.stack.slice(0, MAX_STACK) : null,
          route: e.route ?? null,
          method: e.method ?? null,
          provider: e.provider ?? null,
          model: e.model ?? null,
          status: e.status ?? null,
          userId: e.userId ?? null,
          detail,
        })
        .run(),
    );
  } catch {
    // Non-critical — never let error logging break the request.
  }
}

/**
 * Wrap a route handler so any thrown error is logged (source "api") with the
 * request path/method, then rethrown. The catch-all net for routes that aren't
 * individually instrumented — Next has no global API error hook. New routes
 * should wrap their handler with this.
 */
export function withErrorLogging<A extends [Request, ...unknown[]], R>(
  handler: (...args: A) => Promise<R>,
): (...args: A) => Promise<R> {
  return async (...args: A): Promise<R> => {
    try {
      return await handler(...args);
    } catch (err) {
      const req = args[0];
      const info = errInfo(err);
      let route: string | undefined;
      try {
        route = new URL(req.url).pathname;
      } catch {
        route = undefined;
      }
      await logErrorEvent({
        source: "api",
        message: info.message,
        stack: info.stack,
        route,
        method: req.method,
      });
      throw err;
    }
  };
}

/* ── Retention ────────────────────────────────────────────────────────── */

const RETENTION_DAYS = Number(process.env.ERROR_RETENTION_DAYS ?? 30);
const HARD_CAP = 50_000;

/** Delete errors older than the retention window; trim to the hard cap. */
export async function pruneErrorEvents(): Promise<number> {
  let removed = 0;
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000);
    const byAge = await withWriteRetry(() =>
      db
        .delete(errorEvents)
        .where(lt(errorEvents.createdAt, cutoff))
        .returning({ id: errorEvents.id }),
    );
    removed += byAge.length;

    // If still over the hard cap, drop the oldest beyond it.
    const countRows = await db
      .select({ c: sql<number>`count(*)` })
      .from(errorEvents);
    const total = countRows[0]?.c ?? 0;
    if (total > HARD_CAP) {
      const overflow = total - HARD_CAP;
      const oldest = await db
        .select({ id: errorEvents.id })
        .from(errorEvents)
        .orderBy(errorEvents.createdAt)
        .limit(overflow);
      const ids = oldest.map((r) => r.id);
      if (ids.length) {
        await withWriteRetry(() =>
          db
            .delete(errorEvents)
            .where(
              and(
                sql`${errorEvents.id} in (${sql.join(
                  ids.map((i) => sql`${i}`),
                  sql`, `,
                )})`,
              ),
            )
            .run(),
        );
        removed += ids.length;
      }
    }
  } catch {
    // Best-effort.
  }
  return removed;
}
