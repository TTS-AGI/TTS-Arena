/**
 * Async security sweep — periodic cross-vote / cross-user analysis that the
 * inline (single-vote) checks can't see: coordinated rings sharing an IP or
 * fingerprint, bursts of fresh accounts piling onto one model, per-user
 * choice-bias with snap decisions, and — the one that catches a patient
 * attacker — voters whose preference for a single model is statistically
 * impossible to have arrived at by listening. Suspicious votes are retro-flagged
 * (countsForPublic=false), trust scores adjusted, egregious accounts
 * quarantined, and the leaderboard recomputed from the clean set.
 *
 * Runs from the existing cleanup interval (src/server/arena/cleanup.ts). All
 * thresholds live in SECURITY (src/server/arena/security.ts).
 */
import { and, eq, gte, inArray, isNotNull, sql, type SQL } from "drizzle-orm";
import { binomialUpperTail } from "@ttsa/shared";
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
  /**
   * Conditional preference. The cluster and bias sweeps above both look for
   * someone in a hurry: many accounts at once, or snap decisions. Neither sees
   * the attack we actually expect — one person, one real account, listening
   * properly, voting for their own model every time it shows up. That voter's
   * *overall* choice distribution looks ordinary, because their model is only
   * in a slice of their battles. What gives them away is the conditional rate:
   * how often they pick model M out of the battles M appeared in.
   *
   * So we compare that rate against how often everyone else picks M, and ask
   * for the probability of a record at least that lopsided arising by chance.
   * Being right 39 times out of 40 about a model the world splits 55/45 on
   * isn't taste — it's recognition, which is the thing a blind test forbids.
   */
  preference: {
    windowDays: 30, // long: self-voting is patient, and a 24h window misses it
    minUserVotes: 25, // a user with a real history in the window …
    minExposure: 12, // … who has seen the model this many times …
    /**
     * … and whose record is this unlikely under the population's own pick rate.
     * Bonferroni-corrected by the number of (user, model) pairs tested, so the
     * expected number of false accusations per sweep stays below alpha no
     * matter how many pairs the window happens to contain.
     */
    alpha: 1e-3,
    /** Below this many outside votes we don't trust the baseline; assume 50/50. */
    minBaselineExposure: 40,
    trustPenalty: 35,
    /**
     * Minimum gap between runs. The sweep fires every 10 minutes for the fast
     * signals, but a 30-day aggregate can't meaningfully change that often —
     * and it's the most expensive query in here.
     */
    minIntervalMinutes: 60,
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
        // Append rather than replace: the inline assessment's reasons are the
        // audit trail for why the vote looked how it did at the time, and
        // overwriting them loses that. Concatenating as jsonb keeps the column
        // a valid JSON array. Only counting votes are ever flagged, and
        // flagging clears countsForPublic, so a later sweep can't re-append.
        riskReasons: sql`(coalesce(nullif(${votes.riskReasons}, ''), '[]')::jsonb || ${JSON.stringify([reason.kind])}::jsonb)::text`,
      })
      .where(inArray(votes.id, voteIds)),
  );
}

/**
 * Given a filter that selects one cohort's counting votes in the window, flag
 * them when they overwhelmingly favour a single model. Shared by both cluster
 * sweeps — the shape of the evidence is the same whether the cohort was found
 * through shared logins or through the identity that cast the votes.
 */
async function flagLopsidedCohort(params: {
  voteScope: SQL;
  accountIds: number[];
  kind: string;
  ip: string | null;
  fingerprint: string | null;
}): Promise<number> {
  const { voteScope, accountIds, kind, ip, fingerprint } = params;

  const byModel = await db
    .select({ modelId: votes.chosenModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(voteScope)
    .groupBy(votes.chosenModelId);

  const total = byModel.reduce((s, r) => s + r.c, 0);
  if (total < SWEEP.cluster.minVotesForModel) return 0;
  const top = byModel.sort((a, b) => b.c - a.c)[0];
  if (!top) return 0;
  const ratio = top.c / total;
  if (
    top.c < SWEEP.cluster.minVotesForModel ||
    ratio < SWEEP.cluster.lopsidedRatio
  ) {
    return 0;
  }

  const toFlag = await db
    .select({ id: votes.id })
    .from(votes)
    .where(and(voteScope, eq(votes.chosenModelId, top.modelId)));
  const ids = toFlag.map((r) => r.id);
  await flagVotes(ids, { kind, detail: {} });

  await logSecurityEvent({
    kind,
    severity: "critical",
    ip,
    fingerprint,
    detail: {
      accounts: accountIds.length,
      model: top.modelId,
      votes: top.c,
      ratio: Number(ratio.toFixed(2)),
    },
  });
  // Nudge trust down for the involved accounts.
  if (accountIds.length > 0) {
    await withWriteRetry(() =>
      db
        .update(users)
        .set({ trustScore: sql`greatest(0, ${users.trustScore} - 30)` })
        .where(inArray(users.id, accountIds)),
    );
  }
  return ids.length;
}

/**
 * Coordinated rings, by shared sign-in: accounts that logged in from the same
 * IP or fingerprint and then piled votes onto a single model.
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

      flagged += await flagLopsidedCohort({
        voteScope: and(
          inArray(votes.userId, accountIds),
          gte(votes.createdAt, since),
          eq(votes.countsForPublic, true),
        )!,
        accountIds,
        kind: `${field}_cluster`,
        ip: field === "ip" ? grp.value : null,
        fingerprint: field === "fingerprint" ? grp.value : null,
      });
    }
  }
  return flagged;
}

/**
 * The same shape, keyed on the identity that actually cast each vote.
 *
 * sweepClusters above can only see accounts that *signed in* together in the
 * window, which is the one moment an attacker has every reason to make look
 * clean: log each account in once from somewhere ordinary, then vote from
 * wherever. Votes now carry their own IP and fingerprint, so a ring that shares
 * a machine while voting is visible even when its logins never overlapped.
 */
async function sweepVoteClusters(sinceMs: number): Promise<number> {
  let flagged = 0;
  const since = new Date(sinceMs);

  for (const field of ["ip", "fingerprint"] as const) {
    const col = field === "ip" ? votes.ip : votes.fingerprint;
    const base = and(
      gte(votes.createdAt, since),
      eq(votes.countsForPublic, true),
      isNotNull(col),
    );

    const shared = await db
      .select({
        value: col,
        accounts: sql<number>`count(distinct ${votes.userId})`,
      })
      .from(votes)
      .where(base)
      .groupBy(col)
      .having(
        sql`count(distinct ${votes.userId}) >= ${SWEEP.cluster.minAccounts}`,
      );

    for (const grp of shared) {
      if (!grp.value) continue;
      const accountRows = await db
        .selectDistinct({ userId: votes.userId })
        .from(votes)
        .where(and(base, eq(col, grp.value)));

      flagged += await flagLopsidedCohort({
        voteScope: and(base, eq(col, grp.value))!,
        accountIds: accountRows.map((r) => r.userId),
        kind: `${field}_vote_cluster`,
        ip: field === "ip" ? grp.value : null,
        fingerprint: field === "fingerprint" ? grp.value : null,
      });
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
          .set({ trustScore: sql`greatest(0, ${users.trustScore} - 40)` })
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

/**
 * Per-model win/loss totals over the counting votes in a window, optionally
 * restricted to a set of users. Returned as modelId → {picks, exposure}, where
 * exposure counts every battle the model appeared in on either side.
 */
async function tallyByModel(
  since: Date,
  userIds?: number[],
): Promise<Map<string, { picks: number; exposure: number }>> {
  const scope = and(
    gte(votes.createdAt, since),
    eq(votes.countsForPublic, true),
    userIds ? inArray(votes.userId, userIds) : undefined,
  );

  const out = new Map<string, { picks: number; exposure: number }>();
  const bump = (id: string, picks: number, exposure: number) => {
    const cur = out.get(id) ?? { picks: 0, exposure: 0 };
    cur.picks += picks;
    cur.exposure += exposure;
    out.set(id, cur);
  };

  const won = await db
    .select({ modelId: votes.chosenModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(scope)
    .groupBy(votes.chosenModelId);
  for (const r of won) bump(r.modelId, r.c, r.c);

  const lost = await db
    .select({ modelId: votes.rejectedModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(scope)
    .groupBy(votes.rejectedModelId);
  for (const r of lost) bump(r.modelId, 0, r.c);

  return out;
}

/** The same tally, but broken out per user: userId → modelId → counts. */
async function tallyByUserAndModel(
  since: Date,
  userIds: number[],
): Promise<Map<number, Map<string, { picks: number; exposure: number }>>> {
  const out = new Map<
    number,
    Map<string, { picks: number; exposure: number }>
  >();
  const bump = (
    userId: number,
    modelId: string,
    picks: number,
    exposure: number,
  ) => {
    let byModel = out.get(userId);
    if (!byModel) out.set(userId, (byModel = new Map()));
    const cur = byModel.get(modelId) ?? { picks: 0, exposure: 0 };
    cur.picks += picks;
    cur.exposure += exposure;
    byModel.set(modelId, cur);
  };

  for (const side of ["chosen", "rejected"] as const) {
    const col = side === "chosen" ? votes.chosenModelId : votes.rejectedModelId;
    const rows = await db
      .select({
        userId: votes.userId,
        modelId: col,
        c: sql<number>`count(*)`,
      })
      .from(votes)
      .where(
        and(
          gte(votes.createdAt, since),
          eq(votes.countsForPublic, true),
          inArray(votes.userId, userIds),
        ),
      )
      .groupBy(votes.userId, col);
    for (const r of rows) {
      bump(r.userId, r.modelId, side === "chosen" ? r.c : 0, r.c);
    }
  }
  return out;
}

/**
 * Conditional preference anomalies: a voter who picks one model far more often
 * than the population does, measured only over the battles that model was in.
 *
 * The baseline for each model excludes the user being tested, so an attacker
 * who supplies a large share of a new model's votes can't drag the expectation
 * up to meet their own behaviour — with a thin model that's the difference
 * between catching them and certifying them.
 */
let lastPreferenceRun = 0;

async function sweepPreference(): Promise<number> {
  const P = SWEEP.preference;
  if (Date.now() - lastPreferenceRun < P.minIntervalMinutes * 60_000) return 0;
  lastPreferenceRun = Date.now();
  const since = new Date(Date.now() - P.windowDays * 24 * HOUR_MS);

  // Only users with a real history in the window are worth testing.
  const candidates = await db
    .select({ userId: votes.userId, total: sql<number>`count(*)` })
    .from(votes)
    .where(and(gte(votes.createdAt, since), eq(votes.countsForPublic, true)))
    .groupBy(votes.userId)
    .having(sql`count(*) >= ${P.minUserVotes}`);
  const userIds = candidates.map((c) => c.userId);
  if (userIds.length === 0) return 0;

  const global = await tallyByModel(since);
  const perUser = await tallyByUserAndModel(since, userIds);

  // Pass 1: score every eligible pair, so the significance cutoff can be
  // corrected for how many were actually tested.
  type Suspect = {
    userId: number;
    modelId: string;
    picks: number;
    exposure: number;
    baseline: number;
    pValue: number;
  };
  const scored: Suspect[] = [];
  for (const [userId, byModel] of perUser) {
    for (const [modelId, mine] of byModel) {
      if (mine.exposure < P.minExposure) continue;
      const all = global.get(modelId);
      if (!all) continue;

      // The population minus this user.
      const outsidePicks = all.picks - mine.picks;
      const outsideExposure = all.exposure - mine.exposure;
      const baseline =
        outsideExposure >= P.minBaselineExposure
          ? outsidePicks / outsideExposure
          : 0.5;

      // Only an *unusually favourable* record is evidence of recognition.
      if (mine.picks / mine.exposure <= baseline) continue;
      scored.push({
        userId,
        modelId,
        picks: mine.picks,
        exposure: mine.exposure,
        baseline,
        pValue: binomialUpperTail(mine.picks, mine.exposure, baseline),
      });
    }
  }
  if (scored.length === 0) return 0;

  // Pass 2: Bonferroni over the pairs actually tested.
  const cutoff = P.alpha / scored.length;
  let flagged = 0;
  for (const s of scored) {
    if (s.pValue >= cutoff) continue;

    const toFlag = await db
      .select({ id: votes.id })
      .from(votes)
      .where(
        and(
          eq(votes.userId, s.userId),
          eq(votes.chosenModelId, s.modelId),
          gte(votes.createdAt, since),
          eq(votes.countsForPublic, true),
        ),
      );
    const ids = toFlag.map((r) => r.id);
    await flagVotes(ids, { kind: "preference_anomaly", detail: {} });
    flagged += ids.length;

    await withWriteRetry(() =>
      db
        .update(users)
        .set({
          trustScore: sql`greatest(0, ${users.trustScore} - ${P.trustPenalty})`,
        })
        .where(eq(users.id, s.userId)),
    );
    await logSecurityEvent({
      kind: "preference_anomaly",
      severity: "critical",
      userId: s.userId,
      detail: {
        model: s.modelId,
        picked: s.picks,
        outOf: s.exposure,
        populationRate: Number(s.baseline.toFixed(3)),
        pValue: s.pValue,
        cutoff,
        pairsTested: scored.length,
        windowDays: P.windowDays,
      },
    });
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
    const a =
      (await sweepClusters(sinceMs)) + (await sweepVoteClusters(sinceMs));
    const b = await sweepBias(sinceMs);
    // Runs on its own, much longer window — see SWEEP.preference.
    const c = await sweepPreference();
    const q = await sweepQuarantine();
    if (a + b + c + q > 0) {
      // Ratings must reflect only clean votes after retro-flagging.
      const n = await recomputeFromCleanVotes();
      invalidateBTCache();
      console.info(
        `[security] sweep: flagged ${a + b + c} votes (${c} by preference), quarantined ${q}; recomputed from ${n} clean votes`,
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
