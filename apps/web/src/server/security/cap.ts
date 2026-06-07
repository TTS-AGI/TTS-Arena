/**
 * Cap.js proof-of-work captcha, embedded (no Redis/standalone server). Challenge
 * + token state is persisted in SQLite (cap_challenges / cap_tokens) via a custom
 * storage adapter, so it survives restarts and works on the single-file DB.
 *
 * Flow: client widget GETs a challenge (/api/cap/challenge → createChallenge),
 * solves the PoW, POSTs solutions (/api/cap/redeem → redeemChallenge) to get a
 * verification token, then sends that token with the vote. The server validates
 * it once with verifyCapToken (single-use).
 */
import Cap from "@cap.js/server";
import { lt } from "drizzle-orm";
import { eq } from "drizzle-orm";
import { db, withWriteRetry } from "../db/client";
import { capChallenges, capTokens } from "../db/schema";

type ChallengeData = {
  challenge: { c: number; s: number; d: number };
  expires: number;
};

let instance: Cap | null = null;

function getCap(): Cap {
  if (instance) return instance;
  instance = new Cap({
    // Don't write a tokens file; our SQLite storage is the source of truth.
    noFSState: true,
    storage: {
      challenges: {
        store: async (token: string, data: ChallengeData) => {
          await withWriteRetry(() =>
            db
              .insert(capChallenges)
              .values({
                token,
                data: JSON.stringify(data),
                expires: data.expires,
              })
              .onConflictDoUpdate({
                target: capChallenges.token,
                set: { data: JSON.stringify(data), expires: data.expires },
              }),
          );
        },
        read: async (token: string) => {
          const row = await db.query.capChallenges.findFirst({
            where: eq(capChallenges.token, token),
          });
          return row ? (JSON.parse(row.data) as ChallengeData) : null;
        },
        delete: async (token: string) => {
          await withWriteRetry(() =>
            db.delete(capChallenges).where(eq(capChallenges.token, token)),
          );
        },
        deleteExpired: async () => {
          await withWriteRetry(() =>
            db
              .delete(capChallenges)
              .where(lt(capChallenges.expires, Date.now())),
          );
        },
      },
      tokens: {
        store: async (key: string, expires: number) => {
          await withWriteRetry(() =>
            db.insert(capTokens).values({ key, expires }).onConflictDoUpdate({
              target: capTokens.key,
              set: { expires },
            }),
          );
        },
        get: async (key: string) => {
          const row = await db.query.capTokens.findFirst({
            where: eq(capTokens.key, key),
          });
          return row ? row.expires : null;
        },
        delete: async (key: string) => {
          await withWriteRetry(() =>
            db.delete(capTokens).where(eq(capTokens.key, key)),
          );
        },
        deleteExpired: async () => {
          await withWriteRetry(() =>
            db.delete(capTokens).where(lt(capTokens.expires, Date.now())),
          );
        },
      },
    },
  });
  return instance;
}

export async function createCapChallenge() {
  return getCap().createChallenge();
}

export async function redeemCapChallenge(input: {
  token: string;
  solutions: unknown;
}) {
  // The widget produces the `solutions` payload; hand it through as Cap expects.
  return getCap().redeemChallenge(
    input as Parameters<Cap["redeemChallenge"]>[0],
  );
}

/** Validate a verification token (single-use). Returns true if valid. */
export async function verifyCapToken(token: string | null): Promise<boolean> {
  if (!token) return false;
  try {
    const { success } = await getCap().validateToken(token);
    return success === true;
  } catch {
    return false;
  }
}
