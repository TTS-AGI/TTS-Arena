/**
 * Security event logging — the admin-facing audit feed. Best-effort: a logging
 * failure never breaks the action that triggered it.
 */
import { db, withWriteRetry } from "../db/client";
import { securityEvents } from "../db/schema";

export type Severity = "info" | "warn" | "critical";

export async function logSecurityEvent(e: {
  kind: string;
  severity?: Severity;
  userId?: number | null;
  ip?: string | null;
  fingerprint?: string | null;
  voteId?: number | null;
  detail?: unknown;
}): Promise<void> {
  try {
    await withWriteRetry(() =>
      db
        .insert(securityEvents)
        .values({
          kind: e.kind,
          severity: e.severity ?? "info",
          userId: e.userId ?? null,
          ip: e.ip ?? null,
          fingerprint: e.fingerprint ?? null,
          voteId: e.voteId ?? null,
          detail: e.detail === undefined ? null : JSON.stringify(e.detail),
        })
        .run(),
    );
  } catch {
    // Non-critical.
  }
}
