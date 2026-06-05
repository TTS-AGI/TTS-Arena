/**
 * Record a login/connection event for a user. Appends to the full history
 * (user_logins) — every IP, user agent, and fingerprint a user has connected
 * from is kept, for abuse investigation. Best-effort: failures never block auth.
 */
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
