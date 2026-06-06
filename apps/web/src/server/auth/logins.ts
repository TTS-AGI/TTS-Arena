/**
 * Record a login/connection event for a user. Appends to the full history
 * (user_logins) — every IP, user agent, and fingerprint a user has connected
 * from is kept, for abuse investigation. Best-effort: failures never block auth.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "../db/client";
import { userLogins } from "../db/schema";

export async function recordLogin(params: {
  userId: number;
  ip: string | null;
  userAgent: string | null;
  fingerprint: string | null;
}): Promise<void> {
  try {
    await db.insert(userLogins).values({
      userId: params.userId,
      ip: params.ip,
      userAgent: params.userAgent?.slice(0, 500) ?? null,
      fingerprint: params.fingerprint?.slice(0, 128) ?? null,
    });
  } catch {
    // Logging is non-critical; swallow errors.
  }
}

/** The user's most recent non-null FingerprintJS visitor id, if any. */
export async function latestFingerprint(
  userId: number,
): Promise<string | null> {
  const row = await db
    .select({ fingerprint: userLogins.fingerprint })
    .from(userLogins)
    .where(
      and(eq(userLogins.userId, userId), isNotNull(userLogins.fingerprint)),
    )
    .orderBy(desc(userLogins.createdAt))
    .limit(1);
  return row[0]?.fingerprint ?? null;
}
