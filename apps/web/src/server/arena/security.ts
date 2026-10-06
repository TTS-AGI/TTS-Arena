/**
 * Anti-fraud assessment — thin public shim over the seam.
 *
 * `assessVote`, `SECURITY`, and the `Assessment` type now live behind
 * `@/server/antifraud` (real logic in the private repo TTS-AGI/Antifraud,
 * cloned in at deploy; a permissive stub in the public repo). This file stays
 * so existing call sites keep importing from `@/server/arena/security`, and it
 * keeps `lastVoteAgeSeconds` — a cooldown-UX read, not a detection tactic.
 */
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { votes } from "../db/schema";

export { assessVote, SECURITY } from "@/server/antifraud";
export type { Assessment } from "@/server/antifraud";

/** The most recent vote's age for a user, in seconds (for cooldown UX). */
export async function lastVoteAgeSeconds(
  userId: number,
): Promise<number | null> {
  const row = await db.query.votes.findFirst({
    where: eq(votes.userId, userId),
    orderBy: (v, { desc }) => desc(v.createdAt),
    columns: { createdAt: true },
  });
  if (!row) return null;
  return (Date.now() - row.createdAt.getTime()) / 1000;
}
