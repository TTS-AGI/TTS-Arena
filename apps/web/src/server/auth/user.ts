/**
 * Resolve the current user from the session cookie, and the upsert used after
 * a successful OAuth callback.
 */
import { eq } from "drizzle-orm";
import type { ApiUser } from "@ttsa/shared";
import { db } from "../db/client";
import { users, type UserRow } from "../db/schema";
import { isAdmin } from "../env";
import { readSession } from "./session";
import type { HFProfile } from "./hf";

export function toApiUser(row: UserRow): ApiUser {
  return {
    id: row.id,
    username: row.username,
    hfId: row.hfId,
    avatarUrl: row.avatarUrl,
    showInLeaderboard: row.showInLeaderboard,
    isAdmin: isAdmin(row.username),
  };
}

/** The signed-in user, or null. */
export async function currentUser(): Promise<UserRow | null> {
  const uid = await readSession();
  if (uid === null) return null;
  const row = await db.query.users.findFirst({ where: eq(users.id, uid) });
  return row ?? null;
}

/**
 * Create or update a user from an HF profile. Keyed on `hfId` so a username
 * change doesn't orphan the account. Backfills `hfAccountCreated` if missing.
 */
export async function upsertUser(
  profile: HFProfile,
  hfAccountCreated: Date | null,
): Promise<UserRow> {
  const existing = await db.query.users.findFirst({
    where: eq(users.hfId, profile.hfId),
  });

  if (existing) {
    // Refresh mutable profile fields on each login (name, email, avatar);
    // backfill the account-creation date if we didn't have it.
    const [updated] = await db
      .update(users)
      .set({
        username: profile.username,
        email: profile.email,
        avatarUrl: profile.avatarUrl,
        hfAccountCreated: existing.hfAccountCreated ?? hfAccountCreated,
      })
      .where(eq(users.id, existing.id))
      .returning();
    return updated ?? existing;
  }

  const [created] = await db
    .insert(users)
    .values({
      username: profile.username,
      hfId: profile.hfId,
      email: profile.email,
      avatarUrl: profile.avatarUrl,
      hfAccountCreated,
    })
    .returning();
  if (!created) throw new Error("Failed to create user");
  return created;
}
