/**
 * Battle session store.
 *
 * The whole point: model identity stays on the server until the user votes.
 * The client receives only an opaque `sessionId` and two audio URLs keyed "a"
 * and "b" — it never learns which model is which (or even the candidate set)
 * before voting, which prevents identity-driven manipulation.
 *
 * In-memory with TTL, suitable for a single-instance deploy. The interface is
 * narrow so it can be swapped for Redis without touching callers.
 */
import type { ModelType } from "@ttsa/shared";
import { SESSION_TTL_SECONDS } from "@ttsa/shared";

export type BattleSide = {
  modelId: string;
  voice: string;
  audio: Buffer;
  extension: string;
};

export type BattleSession = {
  id: string;
  userId: number;
  modelType: ModelType;
  text: string;
  sentenceHash: string;
  a: BattleSide;
  b: BattleSide;
  createdAt: number;
  expiresAt: number;
  voted: boolean;
};

const sessions = new Map<string, BattleSession>();

function now(): number {
  return Date.now();
}

export function createSession(
  input: Omit<BattleSession, "id" | "createdAt" | "expiresAt" | "voted">,
): BattleSession {
  const id = crypto.randomUUID();
  const created = now();
  const session: BattleSession = {
    ...input,
    id,
    createdAt: created,
    expiresAt: created + SESSION_TTL_SECONDS * 1000,
    voted: false,
  };
  sessions.set(id, session);
  return session;
}

/** Get a live (non-expired) session, evicting it if expired. */
export function getSession(id: string): BattleSession | null {
  const s = sessions.get(id);
  if (!s) return null;
  if (s.expiresAt <= now()) {
    sessions.delete(id);
    return null;
  }
  return s;
}

export function markVoted(id: string): void {
  const s = sessions.get(id);
  if (s) s.voted = true;
}

export function deleteSession(id: string): void {
  sessions.delete(id);
}

/** Evict expired sessions; returns how many were removed. */
export function sweepExpired(): number {
  const t = now();
  let removed = 0;
  for (const [id, s] of sessions) {
    if (s.expiresAt <= t) {
      sessions.delete(id);
      removed++;
    }
  }
  return removed;
}

// Periodic sweep (no-op in test/edge runtimes without setInterval timers kept
// alive). unref so it never holds the process open.
const timer = setInterval(() => sweepExpired(), 5 * 60 * 1000);
if (typeof timer === "object" && "unref" in timer) timer.unref();
