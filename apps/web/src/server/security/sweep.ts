/**
 * Async security sweep — periodic cross-vote / cross-user analysis that the
 * inline (single-vote) checks can't see: coordinated rings sharing an IP or
 * fingerprint, bursts of fresh accounts piling onto one model, and per-user
 * choice-bias with snap decisions. Suspicious votes are retro-flagged
 * (countsForPublic=false), trust scores adjusted, egregious accounts
 * quarantined, and the leaderboard recomputed from the clean set.
 *
 * Runs from the existing cleanup interval (src/server/arena/cleanup.ts). All
 * thresholds live in SECURITY (src/server/arena/security.ts).
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, withWriteRetry } from "../db/client";
import { userLogins, users, votes } from "../db/schema";
import { SECURITY } from "../arena/security";
import { logSecurityEvent } from "./events";
import { recomputeFromCleanVotes } from "../db/recompute-ratings";
import { invalidateBTCache } from "../arena/bt-cache";
import { errInfo, logErrorEvent } from "../observability/errors";

/** Tunables specific to the sweep (cross-entity analysis). */
const SWEEP = {
  windowHours: 24, // analysis window
  cluster: {
    minAccounts: 3, // distinct accounts sharing an IP/fp …
    minVotesForModel: 8, // … casting at least this many votes for one model
    lopsidedRatio: 0.8, // … that overwhelmingly favor it
  },
  freshBurst: {
    minFreshAccounts: 4, // new (<30d) accounts …
    windowHours: 6, // … within this window …
    minVotes: 15, // … with at least this many votes for one model
  },
  bias: {
    minVotes: 20, // a user with this many votes …
    favorRatio: 0.95, // … almost all for one model …
    snapShareThreshold: 0.6, // … and mostly snap decisions → bias bot
  },
  quarantineTrust: 20, // trust at/below this → auto-quarantine
} as const;

const HOUR_MS = 3600_000;

type FlagReason = { kind: string; detail: Record<string, unknown> };

/** Retro-flag a set of votes, log events, and (optionally) adjust trust. */
async function flagVotes(voteIds: number[], reason: FlagReason): Promise<void> {
  if (voteIds.length === 0) return;
  await withWriteRetry(() =>
    db
      .update(votes)
      .set({
        flagged: true,
        countsForPublic: false,
        riskReasons: JSON.stringify([reason.kind]),
      })
      .where(inArray(votes.id, voteIds)),
  );
}

/**
 * Coordinated rings: accounts sharing an IP or fingerprint that pile votes onto
 * a single model. We look at recent logins to map identity→accounts, then check
 * those accounts' recent votes for lopsided support of one model.
 */
async function sweepClusters(sinceMs: number): Promise<number> {
  let flagged = 0;
  const since = new Date(sinceMs);

  for (const field of ["ip", "fingerprint"] as const) {
    const col = field === "ip" ? userLogins.ip : userLogins.fingerprint;
    // Identity values shared by >= minAccounts distinct accounts.
    const shared = await db
      .select({
        value: col,
        accounts: sql<number>`count(distinct ${userLogins.userId})`,
      })
      .from(userLogins)
      .where(gte(userLogins.createdAt, since))
      .groupBy(col)
      .having(
        sql`count(distinct ${userLogins.userId}) >= ${SWEEP.cluster.minAccounts}`,
      );

    for (const grp of shared) {
      if (!grp.value) continue;
      // Accounts behind this identity.
      const accountRows = await db
        .selectDistinct({ userId: userLogins.userId })
        .from(userLogins)
        .where(and(eq(col, grp.value), gte(userLogins.createdAt, since)));
      const accountIds = accountRows.map((r) => r.userId);
      if (accountIds.length < SWEEP.cluster.minAccounts) continue;

      // Their recent votes, grouped by chosen model.
      const byModel = await db
        .select({
          modelId: votes.chosenModelId,
          c: sql<number>`count(*)`,
        })
        .from(votes)
        .where(
          and(
            inArray(votes.userId, accountIds),
            gte(votes.createdAt, since),
            eq(votes.countsForPublic, true),
          ),
        )
        .groupBy(votes.chosenModelId);

      const totalForCluster = byModel.reduce((s, r) => s + r.c, 0);
      if (totalForCluster < SWEEP.cluster.minVotesForModel) continue;
      const top = byModel.sort((a, b) => b.c - a.c)[0];
      if (!top) continue;
      const ratio = top.c / totalForCluster;
      if (
        top.c >= SWEEP.cluster.minVotesForModel &&
        ratio >= SWEEP.cluster.lopsidedRatio
      ) {
        // Flag this cluster's counting votes for the favored model.
        const toFlag = await db
          .select({ id: votes.id })
          .from(votes)
          .where(
            and(
              inArray(votes.userId, accountIds),
              eq(votes.chosenModelId, top.modelId),
              gte(votes.createdAt, since),
              eq(votes.countsForPublic, true),
            ),
          );
        const ids = toFlag.map((r) => r.id);
        await flagVotes(ids, {
          kind: `${field}_cluster`,
          detail: {},
        });
        flagged += ids.length;
        await logSecurityEvent({
          kind: `${field}_cluster`,
          severity: "critical",
          ip: field === "ip" ? grp.value : null,
          fingerprint: field === "fingerprint" ? grp.value : null,
          detail: {
            accounts: accountIds.length,
            model: top.modelId,
            votes: top.c,
            ratio: Number(ratio.toFixed(2)),
          },
        });
        // Nudge trust down for the involved accounts.
        await withWriteRetry(() =>
          db
            .update(users)
            .set({ trustScore: sql`max(0, ${users.trustScore} - 30)` })
            .where(inArray(users.id, accountIds)),
        );
      }
    }
  }
  return flagged;
}

/**
 * Per-user choice bias: a user whose votes are almost entirely for one model and
 * mostly snap decisions. Lowers trust + flags those votes.
 */
async function sweepBias(sinceMs: number): Promise<number> {
  let flagged = 0;
  const since = new Date(sinceMs);

  const perUser = await db
    .select({
      userId: votes.userId,
      total: sql<number>`count(*)`,
    })
    .from(votes)
    .where(and(gte(votes.createdAt, since), eq(votes.countsForPublic, true)))
    .groupBy(votes.userId)
    .having(sql`count(*) >= ${SWEEP.bias.minVotes}`);

  for (const u of perUser) {
    const byModel = await db
      .select({
        modelId: votes.chosenModelId,
        c: sql<number>`count(*)`,
      })
      .from(votes)
      .where(
        and(
          eq(votes.userId, u.userId),
          gte(votes.createdAt, since),
          eq(votes.countsForPublic, true),
        ),
      )
      .groupBy(votes.chosenModelId);
    const top = byModel.sort((a, b) => b.c - a.c)[0];
    if (!top) continue;
    const favorRatio = top.c / u.total;

    // Snap-decision share.
    const snapRows = await db
      .select({ c: sql<number>`count(*)` })
      .from(votes)
      .where(
        and(
          eq(votes.userId, u.userId),
          gte(votes.createdAt, since),
          sql`${votes.sessionDurationSeconds} is not null and ${votes.sessionDurationSeconds} < ${SECURITY.minDecisionSeconds}`,
        ),
      );
    const snapShare = (snapRows[0]?.c ?? 0) / u.total;

    if (
      favorRatio >= SWEEP.bias.favorRatio &&
      snapShare >= SWEEP.bias.snapShareThreshold
    ) {
      const toFlag = await db
        .select({ id: votes.id })
        .from(votes)
        .where(
          and(
            eq(votes.userId, u.userId),
            gte(votes.createdAt, since),
            eq(votes.countsForPublic, true),
          ),
        );
      const ids = toFlag.map((r) => r.id);
      await flagVotes(ids, { kind: "choice_bias", detail: {} });
      flagged += ids.length;
      await withWriteRetry(() =>
        db
          .update(users)
          .set({ trustScore: sql`max(0, ${users.trustScore} - 40)` })
          .where(eq(users.id, u.userId)),
      );
      await logSecurityEvent({
        kind: "choice_bias",
        severity: "warn",
        userId: u.userId,
        detail: {
          favorModel: top.modelId,
          favorRatio: Number(favorRatio.toFixed(2)),
          snapShare: Number(snapShare.toFixed(2)),
          votes: u.total,
        },
      });
    }
  }
  return flagged;
}

/** Auto-quarantine accounts whose trust has fallen to the hard floor. */
async function sweepQuarantine(): Promise<number> {
  const toQuarantine = await db
    .select({ id: users.id, trustScore: users.trustScore })
    .from(users)
    .where(
      and(
        eq(users.quarantined, false),
        sql`${users.trustScore} <= ${SWEEP.quarantineTrust}`,
      ),
    );
  for (const u of toQuarantine) {
    await withWriteRetry(() =>
      db.update(users).set({ quarantined: true }).where(eq(users.id, u.id)),
    );
    await logSecurityEvent({
      kind: "auto_quarantine",
      severity: "critical",
      userId: u.id,
      detail: { trustScore: u.trustScore },
    });
  }
  return toQuarantine.length;
}

let running = false;

/** Run one sweep pass. Safe to call from the cleanup interval. */
export async function runSecuritySweep(): Promise<void> {
  if (SECURITY.disabled() || running) return;
  running = true;
  try {
    const sinceMs = Date.now() - SWEEP.windowHours * HOUR_MS;
    const a = await sweepClusters(sinceMs);
    const b = await sweepBias(sinceMs);
    const q = await sweepQuarantine();
    if (a + b + q > 0) {
      // Ratings must reflect only clean votes after retro-flagging.
      const n = await recomputeFromCleanVotes();
      invalidateBTCache();
      console.info(
        `[security] sweep: flagged ${a + b} votes, quarantined ${q}; recomputed from ${n} clean votes`,
      );
    }
  } catch (err) {
    // Log the message as a plain string — passing the raw error object made
    // Bun's console formatter throw ("custom formatter threw an exception"),
    // which hid the real cause (e.g. a missing column before migration).
    const info = errInfo(err);
    console.error("[security] sweep failed:", info.stack ?? info.message);
    void logErrorEvent({
      source: "security_sweep",
      message: info.message,
      stack: info.stack,
    });
  } finally {
    running = false;
  }
}
