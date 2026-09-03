/**
 * Admin data layer — Drizzle queries backing the /api/admin routes. Pure data
 * access over the shared `db`; no auth here (routes/layout gate via
 * requireAdmin). Timestamps are returned as unix-epoch seconds (the column
 * mode is "timestamp" → JS Date; we convert to epoch for the JSON contract).
 */
import { and, asc, desc, eq, inArray, isNotNull, like, sql } from "drizzle-orm";
import type {
  AdminAnalytics,
  AdminErrorOverview,
  AdminErrorRow,
  AdminGenerationOverview,
  AdminGenerationRow,
  AdminGenModelStat,
  AdminIpLookup,
  AdminModel,
  AdminOverview,
  AdminSecurityEvent,
  AdminSecurityOverview,
  AdminUserDetail,
  AdminUserRow,
  AdminVoteRow,
} from "@ttsa/shared";
import type { AdminModelDetail } from "@ttsa/shared";
import { db, withWriteRetry } from "../db/client";
import {
  errorEvents,
  generationEvents,
  models,
  ratingHistory,
  securityEvents,
  testResults,
  testRuns,
  userLogins,
  users,
  voiceStats,
  votes,
} from "../db/schema";
import { sentenceStats } from "../arena/sentences";
import { recomputeFromCleanVotes } from "../db/recompute-ratings";
import { invalidateBTCache } from "../arena/bt-cache";
import { logSecurityEvent } from "../security/events";

const epoch = (d: Date | null): number =>
  d ? Math.floor(d.getTime() / 1000) : 0;

function countRows(rows: { c: number }[]): number {
  return rows[0]?.c ?? 0;
}

/**
 * Votes-per-day for the last `days`, zero-filled, with a flagged count per day.
 * `extra` adds a WHERE fragment (e.g. a specific user or model).
 */
async function votesPerDay(
  days: number,
  extra?: import("drizzle-orm").SQL,
): Promise<{ date: string; count: number; flagged: number }[]> {
  const since = sql`now() - ${sql.raw(`interval '${Number(days)} days'`)}`;
  const cond = extra
    ? and(sql`${votes.createdAt} >= ${since}`, extra)
    : sql`${votes.createdAt} >= ${since}`;
  const rows = await db
    .select({
      day: sql<string>`to_char(${votes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      c: sql<number>`count(*)`,
      f: sql<number>`sum(case when ${votes.flagged} then 1 else 0 end)`,
    })
    .from(votes)
    .where(cond)
    .groupBy(sql`to_char(${votes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
  const byDay = new Map(rows.map((r) => [r.day, { c: r.c, f: r.f ?? 0 }]));
  const out: { date: string; count: number; flagged: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const e = byDay.get(d);
    out.push({ date: d, count: e?.c ?? 0, flagged: e?.f ?? 0 });
  }
  return out;
}

/* ── Overview ─────────────────────────────────────────────────────────── */

export async function overviewStats(): Promise<AdminOverview> {
  const [userCount, voteCount, modelCount, activeModelCount] =
    await Promise.all([
      db.select({ c: sql<number>`count(*)` }).from(users),
      db.select({ c: sql<number>`count(*)` }).from(votes),
      db.select({ c: sql<number>`count(*)` }).from(models),
      db
        .select({ c: sql<number>`count(*)` })
        .from(models)
        .where(eq(models.isActive, true)),
    ]);

  // Votes per day over the last 30 days. Group on the local-less unixepoch day.
  const dayRows = await db
    .select({
      day: sql<string>`to_char(${votes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      c: sql<number>`count(*)`,
    })
    .from(votes)
    .where(sql`${votes.createdAt} >= now() - interval '30 days'`)
    .groupBy(sql`to_char(${votes.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`);
  const byDay = new Map(dayRows.map((r) => [r.day, r.c]));
  const votesByDay: AdminOverview["votesByDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    votesByDay.push({ date: d, count: byDay.get(d) ?? 0 });
  }

  const recentVotesRows = await db
    .select({
      id: votes.id,
      createdAt: votes.createdAt,
      username: users.username,
      chosenModel: votes.chosenModelId,
      rejectedModel: votes.rejectedModelId,
      text: votes.text,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .orderBy(desc(votes.createdAt))
    .limit(10);

  const recentUsersRows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      joinDate: users.joinDate,
    })
    .from(users)
    .orderBy(desc(users.joinDate))
    .limit(10);

  return {
    totals: {
      users: countRows(userCount),
      votes: countRows(voteCount),
      models: countRows(modelCount),
      activeModels: countRows(activeModelCount),
    },
    votesByDay,
    recentVotes: recentVotesRows.map((r) => ({
      id: r.id,
      createdAt: epoch(r.createdAt),
      username: r.username,
      chosenModel: r.chosenModel,
      rejectedModel: r.rejectedModel,
      text: r.text,
    })),
    recentUsers: recentUsersRows.map((r) => ({
      id: r.id,
      username: r.username,
      avatarUrl: r.avatarUrl,
      joinDate: epoch(r.joinDate),
    })),
  };
}

/* ── Models ───────────────────────────────────────────────────────────── */

export async function listModels(): Promise<AdminModel[]> {
  const rows = await db.select().from(models);
  // Per-model vote appearances (chosen or rejected).
  const voteAgg = await db
    .select({
      id: votes.chosenModelId,
      c: sql<number>`count(*)`,
    })
    .from(votes)
    .groupBy(votes.chosenModelId);
  const rejAgg = await db
    .select({
      id: votes.rejectedModelId,
      c: sql<number>`count(*)`,
    })
    .from(votes)
    .groupBy(votes.rejectedModelId);
  const counts = new Map<string, number>();
  for (const r of voteAgg) counts.set(r.id, (counts.get(r.id) ?? 0) + r.c);
  for (const r of rejAgg) counts.set(r.id, (counts.get(r.id) ?? 0) + r.c);

  return rows
    .map((m) => ({
      id: m.id,
      name: m.name,
      modelType: m.modelType,
      provider: m.provider,
      isOpen: m.isOpen,
      isActive: m.isActive,
      timedOutUntil: m.timedOutUntil ? epoch(m.timedOutUntil) : null,
      url: m.url,
      icon: m.icon,
      rating: m.rating,
      ratingDeviation: m.ratingDeviation,
      volatility: m.volatility,
      winCount: m.winCount,
      matchCount: m.matchCount,
      voteCount: counts.get(m.id) ?? 0,
      updatedAt: epoch(m.updatedAt),
    }))
    .sort((a, b) => b.rating - a.rating);
}

/* ── Test runs ("Test All") ───────────────────────────────────────────── */

export async function listTestRuns(opts: {
  page: number;
  pageSize: number;
}): Promise<{
  rows: import("@ttsa/shared").AdminTestRun[];
  total: number;
}> {
  const { page, pageSize } = opts;
  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(testRuns);
  const rows = await db
    .select()
    .from(testRuns)
    .orderBy(desc(testRuns.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);
  return {
    total: countRows(totalRows),
    rows: rows.map((r) => ({
      id: r.id,
      status: r.status,
      sentence: r.sentence,
      total: r.total,
      completed: r.completed,
      passed: r.passed,
      failed: r.failed,
      startedBy: r.startedBy,
      createdAt: epoch(r.createdAt),
      finishedAt: r.finishedAt ? epoch(r.finishedAt) : null,
    })),
  };
}

export async function testRunDetail(
  runId: number,
): Promise<import("@ttsa/shared").AdminTestRunDetail | null> {
  const run = await db.query.testRuns.findFirst({
    where: eq(testRuns.id, runId),
  });
  if (!run) return null;
  const results = await db
    .select()
    .from(testResults)
    .where(eq(testResults.runId, runId))
    .orderBy(asc(testResults.id));
  return {
    run: {
      id: run.id,
      status: run.status,
      sentence: run.sentence,
      total: run.total,
      completed: run.completed,
      passed: run.passed,
      failed: run.failed,
      startedBy: run.startedBy,
      createdAt: epoch(run.createdAt),
      finishedAt: run.finishedAt ? epoch(run.finishedAt) : null,
    },
    results: results.map((r) => ({
      id: r.id,
      model: r.model,
      modelName: r.modelName,
      provider: r.provider,
      status: r.status,
      durationMs: r.durationMs ?? null,
      audioUrl: r.audioPath
        ? `/api/admin/tests/audio/${encodeURIComponent(r.audioPath)}`
        : null,
      error: r.error,
    })),
  };
}

/** Whether a run is currently active (used to gate starting a new one). */
export async function hasRunningTestRun(): Promise<boolean> {
  const rows = await db
    .select({ id: testRuns.id })
    .from(testRuns)
    .where(eq(testRuns.status, "running"))
    .limit(1);
  return rows.length > 0;
}

/* ── Model time-out (temporary deactivation, distinct from isActive) ────── */

/** Time a model out for `hours` (suppressed from battles until then). */
export async function timeOutModel(
  id: string,
  hours: number,
): Promise<boolean> {
  const until = new Date(Date.now() + hours * 3600_000);
  const updated = await withWriteRetry(() =>
    db
      .update(models)
      .set({ timedOutUntil: until, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning({ id: models.id }),
  );
  return updated.length > 0;
}

/** Clear a single model's time-out. */
export async function clearModelTimeout(id: string): Promise<boolean> {
  const updated = await withWriteRetry(() =>
    db
      .update(models)
      .set({ timedOutUntil: null, updatedAt: new Date() })
      .where(eq(models.id, id))
      .returning({ id: models.id }),
  );
  return updated.length > 0;
}

/** Clear ALL model time-outs. Returns how many were cleared. */
export async function clearAllModelTimeouts(): Promise<number> {
  const cleared = await withWriteRetry(() =>
    db
      .update(models)
      .set({ timedOutUntil: null, updatedAt: new Date() })
      .where(isNotNull(models.timedOutUntil))
      .returning({ id: models.id }),
  );
  return cleared.length;
}

export async function updateModel(
  id: string,
  patch: {
    name?: string;
    url?: string;
    icon?: string;
    isActive?: boolean;
    hidden?: boolean;
    hiddenReason?: string;
  },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.url !== undefined) set.url = patch.url || null;
  if (patch.icon !== undefined) set.icon = patch.icon || null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;
  if (patch.hidden !== undefined) {
    // coalesce keeps the ORIGINAL delisting timestamp if the model is already
    // hidden, so re-sending the patch (or editing the reason) doesn't rewrite
    // when it happened.
    set.hiddenAt = patch.hidden
      ? sql`coalesce(${models.hiddenAt}, now())`
      : null;
    if (!patch.hidden) set.hiddenReason = null;
  }
  if (patch.hiddenReason !== undefined) {
    set.hiddenReason = patch.hiddenReason || null;
  }

  const updated = await withWriteRetry(() =>
    db.update(models).set(set).where(eq(models.id, id)).returning({
      id: models.id,
    }),
  );
  return updated.length > 0;
}

/* ── Users ────────────────────────────────────────────────────────────── */

export async function listUsers(opts: {
  page: number;
  pageSize: number;
  search?: string;
}): Promise<{ rows: AdminUserRow[]; total: number }> {
  const { page, pageSize, search } = opts;
  const where = search ? like(users.username, `%${search}%`) : undefined;

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(users)
    .where(where);
  const total = countRows(totalRows);

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      avatarUrl: users.avatarUrl,
      email: users.email,
      joinDate: users.joinDate,
      hfAccountCreated: users.hfAccountCreated,
      voteCount: sql<number>`(select count(*) from ${votes} where ${votes.userId} = ${users.id})`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.joinDate))
    .limit(pageSize)
    .offset(page * pageSize);

  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      username: r.username,
      avatarUrl: r.avatarUrl,
      email: r.email,
      joinDate: epoch(r.joinDate),
      hfAccountCreated: r.hfAccountCreated ? epoch(r.hfAccountCreated) : null,
      voteCount: r.voteCount,
    })),
  };
}

export async function userDetail(id: number): Promise<AdminUserDetail | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, id) });
  if (!user) return null;

  const logins = await db
    .select()
    .from(userLogins)
    .where(eq(userLogins.userId, id))
    .orderBy(desc(userLogins.createdAt))
    .limit(100);

  const voteRows = await db
    .select({
      id: votes.id,
      createdAt: votes.createdAt,
      chosenModel: votes.chosenModelId,
      rejectedModel: votes.rejectedModelId,
      flagged: votes.flagged,
      riskScore: votes.riskScore,
      text: votes.text,
    })
    .from(votes)
    .where(eq(votes.userId, id))
    .orderBy(desc(votes.createdAt))
    .limit(50);

  const [voteCountRows, flaggedRows] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(votes)
      .where(eq(votes.userId, id)),
    db
      .select({ c: sql<number>`count(*)` })
      .from(votes)
      .where(and(eq(votes.userId, id), eq(votes.flagged, true))),
  ]);

  const byDay = await votesPerDay(30, eq(votes.userId, id));

  const choiceRows = await db
    .select({ model: votes.chosenModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(eq(votes.userId, id))
    .groupBy(votes.chosenModelId)
    .orderBy(sql`count(*) desc`)
    .limit(12);

  return {
    user: {
      id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
      email: user.email,
      joinDate: epoch(user.joinDate),
      hfAccountCreated: user.hfAccountCreated
        ? epoch(user.hfAccountCreated)
        : null,
      voteCount: countRows(voteCountRows),
      hfId: user.hfId,
      trustScore: user.trustScore,
      quarantined: user.quarantined,
    },
    flaggedVotes: countRows(flaggedRows),
    votesByDay: byDay,
    choiceDistribution: choiceRows.map((r) => ({
      model: r.model,
      count: r.c,
    })),
    logins: logins.map((l) => ({
      id: l.id,
      ip: l.ip,
      userAgent: l.userAgent,
      fingerprint: l.fingerprint,
      createdAt: epoch(l.createdAt),
    })),
    votes: voteRows.map((v) => ({
      id: v.id,
      createdAt: epoch(v.createdAt),
      chosenModel: v.chosenModel,
      rejectedModel: v.rejectedModel,
      flagged: v.flagged,
      riskScore: v.riskScore,
      text: v.text,
    })),
  };
}

/* ── Model detail (drill-down) ────────────────────────────────────────── */

export async function modelDetail(
  id: string,
): Promise<AdminModelDetail | null> {
  const all = await listModels(); // already sorted by rating desc
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  const model = all[idx]!;

  // Rating + RD over time.
  const history = await db
    .select({
      t: ratingHistory.createdAt,
      rating: ratingHistory.rating,
      rd: ratingHistory.ratingDeviation,
    })
    .from(ratingHistory)
    .where(eq(ratingHistory.modelId, id))
    .orderBy(asc(ratingHistory.createdAt))
    .limit(2000);

  // Votes/day where this model appeared (chosen OR rejected).
  const appeared = sql`(${votes.chosenModelId} = ${id} or ${votes.rejectedModelId} = ${id})`;
  const byDay = await votesPerDay(30, appeared);

  // Flagged votes involving this model.
  const flaggedRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(votes)
    .where(and(appeared, eq(votes.flagged, true)));

  // Win/loss vs each opponent (counting votes only).
  const winsRows = await db
    .select({ opp: votes.rejectedModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(and(eq(votes.chosenModelId, id), eq(votes.countsForPublic, true)))
    .groupBy(votes.rejectedModelId);
  const lossRows = await db
    .select({ opp: votes.chosenModelId, c: sql<number>`count(*)` })
    .from(votes)
    .where(and(eq(votes.rejectedModelId, id), eq(votes.countsForPublic, true)))
    .groupBy(votes.chosenModelId);
  const vs = new Map<string, { wins: number; losses: number }>();
  for (const w of winsRows)
    vs.set(w.opp, { wins: w.c, losses: vs.get(w.opp)?.losses ?? 0 });
  for (const l of lossRows)
    vs.set(l.opp, {
      wins: vs.get(l.opp)?.wins ?? 0,
      losses: l.c,
    });
  const nameById = new Map(all.map((m) => [m.id, m.name]));
  const vsOpponents = [...vs.entries()]
    .map(([opp, v]) => {
      const total = v.wins + v.losses;
      return {
        opponent: nameById.get(opp) ?? opp,
        wins: v.wins,
        losses: v.losses,
        winRate: total ? (v.wins / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses))
    .slice(0, 10);

  // Top voters for this model (chose it) + their flagged share, win rate for
  // the model, and an anomaly score vs the model's global pick rate. A single
  // high-anomaly voter is usually a genuine superfan; a *cluster* of them is
  // the manipulation signal (see suspiciousModels()).
  const voterRows = await db
    .select({
      userId: votes.userId,
      username: users.username,
      quarantined: users.quarantined,
      votes: sql<number>`count(*)`,
      flagged: sql<number>`sum(case when ${votes.flagged} then 1 else 0 end)`,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .where(and(eq(votes.chosenModelId, id), eq(votes.countsForPublic, true)))
    .groupBy(votes.userId, users.username, users.quarantined)
    .orderBy(sql`count(*) desc`)
    .limit(10);
  // Per-user losses (they saw the model but picked the opponent) → battle total.
  const voterLossRows = await db
    .select({ userId: votes.userId, losses: sql<number>`count(*)` })
    .from(votes)
    .where(and(eq(votes.rejectedModelId, id), eq(votes.countsForPublic, true)))
    .groupBy(votes.userId);
  const lossByUser = new Map(
    voterLossRows.map((r) => [r.userId, Number(r.losses)]),
  );
  // The model's global counting pick rate, from the vs-opponent totals.
  const gWins = winsRows.reduce((s, r) => s + Number(r.c), 0);
  const gLoss = lossRows.reduce((s, r) => s + Number(r.c), 0);
  const pModel = gWins + gLoss > 0 ? gWins / (gWins + gLoss) : 0.5;

  // Recent votes involving this model.
  const recent = await db
    .select({
      id: votes.id,
      createdAt: votes.createdAt,
      username: users.username,
      modelType: votes.modelType,
      chosenModel: votes.chosenModelId,
      rejectedModel: votes.rejectedModelId,
      chosenVoice: votes.chosenVoice,
      rejectedVoice: votes.rejectedVoice,
      sentenceOrigin: votes.sentenceOrigin,
      countsForPublic: votes.countsForPublic,
      flagged: votes.flagged,
      riskScore: votes.riskScore,
      text: votes.text,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .where(appeared)
    .orderBy(desc(votes.createdAt))
    .limit(25);

  return {
    model,
    rank: idx + 1,
    flaggedVotes: countRows(flaggedRows),
    ratingHistory: history.map((h) => ({
      t: epoch(h.t),
      rating: h.rating,
      rd: h.rd,
    })),
    votesByDay: byDay,
    vsOpponents,
    topVoters: voterRows.map((v) => {
      const k = Number(v.votes);
      const battles = k + (lossByUser.get(v.userId) ?? 0);
      const preferPct = battles > 0 ? (k / battles) * 100 : 0;
      const sd = Math.sqrt(battles * pModel * (1 - pModel));
      const anomalyZ = sd > 0 ? (k - battles * pModel) / sd : 0;
      return {
        userId: v.userId,
        username: v.username,
        votes: k,
        flagged: Number(v.flagged ?? 0),
        battles,
        preferPct,
        anomalyZ,
        quarantined: v.quarantined,
      };
    }),
    recentVotes: recent.map((r) => ({
      id: r.id,
      createdAt: epoch(r.createdAt),
      username: r.username,
      modelType: r.modelType,
      chosenModel: r.chosenModel,
      rejectedModel: r.rejectedModel,
      chosenVoice: r.chosenVoice,
      rejectedVoice: r.rejectedVoice,
      sentenceOrigin: r.sentenceOrigin,
      countsForPublic: r.countsForPublic,
      flagged: r.flagged,
      riskScore: r.riskScore,
      text: r.text,
    })),
  };
}

/* ── Votes ────────────────────────────────────────────────────────────── */

export async function listVotes(opts: {
  page: number;
  pageSize: number;
  modelType?: string;
  userId?: number;
  flaggedOnly?: boolean;
}): Promise<{ rows: AdminVoteRow[]; total: number }> {
  const { page, pageSize, modelType, userId, flaggedOnly } = opts;
  const conds = [];
  if (modelType) conds.push(eq(votes.modelType, modelType));
  if (userId !== undefined) conds.push(eq(votes.userId, userId));
  if (flaggedOnly) conds.push(eq(votes.flagged, true));
  const where = conds.length ? and(...conds) : undefined;

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(votes)
    .where(where);

  const rows = await db
    .select({
      id: votes.id,
      createdAt: votes.createdAt,
      username: users.username,
      modelType: votes.modelType,
      chosenModel: votes.chosenModelId,
      rejectedModel: votes.rejectedModelId,
      chosenVoice: votes.chosenVoice,
      rejectedVoice: votes.rejectedVoice,
      sentenceOrigin: votes.sentenceOrigin,
      countsForPublic: votes.countsForPublic,
      flagged: votes.flagged,
      riskScore: votes.riskScore,
      text: votes.text,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .where(where)
    .orderBy(desc(votes.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);

  return {
    total: countRows(totalRows),
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: epoch(r.createdAt),
      username: r.username,
      modelType: r.modelType,
      chosenModel: r.chosenModel,
      rejectedModel: r.rejectedModel,
      chosenVoice: r.chosenVoice,
      rejectedVoice: r.rejectedVoice,
      sentenceOrigin: r.sentenceOrigin,
      countsForPublic: r.countsForPublic,
      flagged: r.flagged,
      riskScore: r.riskScore,
      text: r.text,
    })),
  };
}

/* ── Analytics ────────────────────────────────────────────────────────── */

export async function analytics(): Promise<AdminAnalytics> {
  const pool = await sentenceStats();

  const originRows = await db
    .select({
      origin: votes.sentenceOrigin,
      c: sql<number>`count(*)`,
    })
    .from(votes)
    .groupBy(votes.sentenceOrigin);

  const allModels = await db
    .select({ id: models.id, name: models.name })
    .from(models);
  const nameById = new Map(allModels.map((m) => [m.id, m.name]));
  const modelsList = await listModels();
  const topModelsByVotes = modelsList
    .map((m) => ({ id: m.id, name: m.name, votes: m.voteCount }))
    .sort((a, b) => b.votes - a.votes)
    .slice(0, 15);

  const topVoiceRows = await db
    .select()
    .from(voiceStats)
    .orderBy(desc(voiceStats.matchCount))
    .limit(20);

  return {
    sentencePool: {
      total: pool.total,
      consumed: pool.consumed,
      remaining: pool.remaining,
      consumptionPct: pool.consumptionPct,
    },
    votesByOrigin: originRows.map((r) => ({ origin: r.origin, count: r.c })),
    topModelsByVotes,
    topVoices: topVoiceRows.map((v) => ({
      modelId: nameById.get(v.modelId) ?? v.modelId,
      voice: v.voice,
      winCount: v.winCount,
      matchCount: v.matchCount,
    })),
  };
}

/* ── Security ─────────────────────────────────────────────────────────── */

function eventRow(r: {
  id: number;
  createdAt: Date;
  kind: string;
  severity: string;
  userId: number | null;
  username: string | null;
  ip: string | null;
  fingerprint: string | null;
  voteId: number | null;
  detail: string | null;
}): AdminSecurityEvent {
  return {
    id: r.id,
    createdAt: epoch(r.createdAt),
    kind: r.kind,
    severity: r.severity,
    userId: r.userId,
    username: r.username,
    ip: r.ip,
    fingerprint: r.fingerprint,
    voteId: r.voteId,
    detail: r.detail,
  };
}

export async function securityOverview(): Promise<AdminSecurityOverview> {
  const [flagged, total, quarantined] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(votes)
      .where(eq(votes.flagged, true)),
    db.select({ c: sql<number>`count(*)` }).from(votes),
    db
      .select({ c: sql<number>`count(*)` })
      .from(users)
      .where(eq(users.quarantined, true)),
  ]);

  const eventsBySeverity = await db
    .select({ severity: securityEvents.severity, c: sql<number>`count(*)` })
    .from(securityEvents)
    .groupBy(securityEvents.severity);

  // Risky IPs: most distinct accounts seen, with their event counts.
  const ipRows = await db
    .select({
      ip: userLogins.ip,
      accounts: sql<number>`count(distinct ${userLogins.userId})`,
    })
    .from(userLogins)
    .where(sql`${userLogins.ip} is not null`)
    .groupBy(userLogins.ip)
    .having(sql`count(distinct ${userLogins.userId}) >= 2`)
    .orderBy(sql`count(distinct ${userLogins.userId}) desc`)
    .limit(10);
  const riskIpEvents = await db
    .select({
      ip: securityEvents.ip,
      events: sql<number>`count(*)`,
    })
    .from(securityEvents)
    .where(sql`${securityEvents.ip} is not null`)
    .groupBy(securityEvents.ip);
  const riskIpEventMap = new Map(
    riskIpEvents.map((r) => [r.ip as string, r.events]),
  );

  const recentEventRows = await db
    .select({
      id: securityEvents.id,
      createdAt: securityEvents.createdAt,
      kind: securityEvents.kind,
      severity: securityEvents.severity,
      userId: securityEvents.userId,
      username: users.username,
      ip: securityEvents.ip,
      fingerprint: securityEvents.fingerprint,
      voteId: securityEvents.voteId,
      detail: securityEvents.detail,
    })
    .from(securityEvents)
    .leftJoin(users, eq(securityEvents.userId, users.id))
    .orderBy(desc(securityEvents.createdAt))
    .limit(20);

  const quarantinedRows = await db
    .select({
      id: users.id,
      username: users.username,
      trustScore: users.trustScore,
    })
    .from(users)
    .where(eq(users.quarantined, true))
    .orderBy(users.trustScore)
    .limit(50);

  return {
    flaggedVotes: countRows(flagged),
    totalVotes: countRows(total),
    quarantinedUsers: countRows(quarantined),
    eventsBySeverity: eventsBySeverity.map((e) => ({
      severity: e.severity,
      count: e.c,
    })),
    topRiskyIps: ipRows
      .filter((r) => r.ip)
      .map((r) => ({
        ip: r.ip as string,
        accounts: r.accounts,
        events: riskIpEventMap.get(r.ip as string) ?? 0,
      })),
    recentEvents: recentEventRows.map(eventRow),
    quarantined: quarantinedRows.map((q) => ({
      id: q.id,
      username: q.username,
      trustScore: q.trustScore,
    })),
    suspiciousModels: await suspiciousModels(),
  };
}

/* Detection tuning. A pair (user, model) is "anomalous" when the user's
 * preference for the model is both statistically extreme (ANOMALY_Z sigma above
 * the crowd's pick rate for that model) AND lopsided in absolute terms
 * (PREFER_MIN). A single such account is usually a genuine superfan — so we only
 * ALERT on a model once RING_MIN of them converge on it. This is intentionally
 * surfacing-only: nothing here flags votes, lowers trust, or quarantines. */
const ANOMALY = {
  minBattles: 20, // ignore thin samples
  z: 4, // sigma above the model's global pick rate
  preferMin: 0.85, // ≥85% of their battles with the model
  ringMin: 2, // this many anomalous accounts on one model = alert
} as const;

type AnomRow = {
  user_id: number;
  username: string;
  model_id: string;
  n: number;
  k: number;
  z: number;
};

/**
 * Model-centric vote-ring detection (alert-only, read-only). Finds models with
 * a cluster of accounts whose preference is anomalously high vs the crowd, and
 * corroborates with shared-IP coordination. Does NOT mutate anything.
 */
export async function suspiciousModels(): Promise<
  AdminSecurityOverview["suspiciousModels"]
> {
  // Per (user, model): battles n and picks k, scored against the model's global
  // counting pick rate. Excludes already-quarantined users (handled elsewhere).
  const res = await db.execute<AnomRow>(sql`
    with model_global as (
      select m.id,
             count(*) filter (where v.chosen_model_id = m.id)::float
               / nullif(count(*), 0) as p
      from models m
      join votes v
        on (v.chosen_model_id = m.id or v.rejected_model_id = m.id)
      where v.counts_for_public = true
      group by m.id
    ),
    um as (
      select v.user_id, m.id as model_id,
             count(*) as n,
             count(*) filter (where v.chosen_model_id = m.id) as k
      from models m
      join votes v
        on (v.chosen_model_id = m.id or v.rejected_model_id = m.id)
      join users u on u.id = v.user_id
      where v.counts_for_public = true and u.quarantined = false
      group by v.user_id, m.id
      having count(*) >= ${ANOMALY.minBattles}
    )
    select um.user_id, uu.username, um.model_id, um.n, um.k,
           (um.k - um.n * mg.p) / sqrt(um.n * mg.p * (1 - mg.p)) as z
    from um
    join model_global mg on mg.id = um.model_id
    join users uu on uu.id = um.user_id
    where mg.p between 0.05 and 0.95
      and um.k::float / um.n >= ${ANOMALY.preferMin}
      and (um.k - um.n * mg.p) / sqrt(um.n * mg.p * (1 - mg.p)) >= ${ANOMALY.z}
    order by z desc
  `);
  const rows = (res as unknown as { rows: AnomRow[] }).rows.map((r) => ({
    ...r,
    n: Number(r.n),
    k: Number(r.k),
    z: Number(r.z),
  }));
  if (rows.length === 0) return [];

  // Group anomalous accounts by model.
  const byModel = new Map<string, AnomRow[]>();
  for (const r of rows) {
    const list = byModel.get(r.model_id) ?? [];
    list.push(r);
    byModel.set(r.model_id, list);
  }

  // Shared-IP corroboration: which of these flagged accounts share an IP with
  // another flagged account? (The signature that separates a ring from a set of
  // independent superfans.)
  const flaggedIds = [...new Set(rows.map((r) => r.user_id))];
  const ipRows = await db
    .selectDistinct({ userId: userLogins.userId, ip: userLogins.ip })
    .from(userLogins)
    .where(
      and(inArray(userLogins.userId, flaggedIds), isNotNull(userLogins.ip)),
    );
  const ipToUsers = new Map<string, Set<number>>();
  for (const r of ipRows) {
    if (!r.ip) continue;
    const set = ipToUsers.get(r.ip) ?? new Set<number>();
    set.add(r.userId);
    ipToUsers.set(r.ip, set);
  }
  // A user "shares" if any of their IPs is used by ≥2 flagged users.
  const sharesIp = new Set<number>();
  for (const users of ipToUsers.values()) {
    if (users.size >= 2) for (const u of users) sharesIp.add(u);
  }

  const nameById = new Map((await listModels()).map((m) => [m.id, m.name]));

  const out = [...byModel.entries()]
    .filter(([, accts]) => accts.length >= ANOMALY.ringMin)
    .map(([modelId, accts]) => {
      const flaggedUsers = new Set(accts.map((a) => a.user_id));
      return {
        modelId,
        modelName: nameById.get(modelId) ?? modelId,
        anomalousAccounts: accts.length,
        sharedIpAccounts: [...flaggedUsers].filter((u) => sharesIp.has(u))
          .length,
        maxAnomalyZ: Math.max(...accts.map((a) => a.z)),
        inflatedVotes: accts.reduce((s, a) => s + a.k, 0),
        accounts: accts
          .sort((a, b) => b.z - a.z)
          .map((a) => ({
            userId: a.user_id,
            username: a.username,
            picks: a.k,
            battles: a.n,
            preferPct: (a.k / a.n) * 100,
            anomalyZ: a.z,
            quarantined: false,
          })),
      };
    })
    // Rings first (most accounts, then most shared-IP corroboration).
    .sort(
      (a, b) =>
        b.anomalousAccounts - a.anomalousAccounts ||
        b.sharedIpAccounts - a.sharedIpAccounts ||
        b.maxAnomalyZ - a.maxAnomalyZ,
    );
  return out;
}

/**
 * All accounts that have logged in from an exact IP, with vote counts and the
 * other IPs each has used (to pivot outward to a wider ring).
 */
export async function usersByIp(ip: string): Promise<AdminIpLookup> {
  const trimmed = ip.trim();
  if (!trimmed) return { ip: trimmed, accounts: [] };

  const idRows = await db
    .selectDistinct({ userId: userLogins.userId })
    .from(userLogins)
    .where(eq(userLogins.ip, trimmed));
  const ids = idRows.map((r) => r.userId);
  if (ids.length === 0) return { ip: trimmed, accounts: [] };

  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      joinDate: users.joinDate,
      trustScore: users.trustScore,
      quarantined: users.quarantined,
      logins: sql<number>`count(distinct ${userLogins.id})`,
      lastSeen: sql<number>`extract(epoch from max(${userLogins.createdAt}))`,
      totalVotes: sql<number>`(select count(*) from ${votes} where ${votes.userId} = ${users.id})`,
    })
    .from(users)
    .innerJoin(userLogins, eq(userLogins.userId, users.id))
    .where(inArray(users.id, ids))
    .groupBy(
      users.id,
      users.username,
      users.joinDate,
      users.trustScore,
      users.quarantined,
    )
    .orderBy(sql`count(distinct ${userLogins.id}) desc`);

  // Each account's full IP set (so the admin can pivot to related IPs).
  const allIps = await db
    .select({ userId: userLogins.userId, ip: userLogins.ip })
    .from(userLogins)
    .where(and(inArray(userLogins.userId, ids), isNotNull(userLogins.ip)));
  const ipsByUser = new Map<number, Set<string>>();
  for (const r of allIps) {
    if (!r.ip) continue;
    const set = ipsByUser.get(r.userId) ?? new Set<string>();
    set.add(r.ip);
    ipsByUser.set(r.userId, set);
  }

  return {
    ip: trimmed,
    accounts: rows.map((r) => ({
      userId: r.id,
      username: r.username,
      joinDate: r.joinDate ? epoch(r.joinDate) : null,
      trustScore: r.trustScore,
      quarantined: r.quarantined,
      logins: Number(r.logins),
      totalVotes: Number(r.totalVotes),
      lastSeen: r.lastSeen ? Number(r.lastSeen) : null,
      otherIps: [...(ipsByUser.get(r.id) ?? new Set())].filter(
        (x) => x !== trimmed,
      ),
    })),
  };
}

export async function listSecurityEvents(opts: {
  page: number;
  pageSize: number;
  severity?: string;
}): Promise<{ rows: AdminSecurityEvent[]; total: number }> {
  const { page, pageSize, severity } = opts;
  const where = severity ? eq(securityEvents.severity, severity) : undefined;

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(securityEvents)
    .where(where);

  const rows = await db
    .select({
      id: securityEvents.id,
      createdAt: securityEvents.createdAt,
      kind: securityEvents.kind,
      severity: securityEvents.severity,
      userId: securityEvents.userId,
      username: users.username,
      ip: securityEvents.ip,
      fingerprint: securityEvents.fingerprint,
      voteId: securityEvents.voteId,
      detail: securityEvents.detail,
    })
    .from(securityEvents)
    .leftJoin(users, eq(securityEvents.userId, users.id))
    .where(where)
    .orderBy(desc(securityEvents.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);

  return { total: countRows(totalRows), rows: rows.map(eventRow) };
}

/** Manually flag/unflag a vote, then recompute ratings from the clean set. */
export async function setVoteFlag(
  voteId: number,
  flagged: boolean,
): Promise<boolean> {
  const updated = await withWriteRetry(() =>
    db
      .update(votes)
      .set({ flagged, countsForPublic: !flagged })
      .where(eq(votes.id, voteId))
      .returning({ id: votes.id }),
  );
  if (updated.length === 0) return false;
  await logSecurityEvent({
    kind: flagged ? "manual_flag" : "manual_unflag",
    severity: "info",
    voteId,
  });
  await recomputeFromCleanVotes();
  invalidateBTCache();
  return true;
}

/* ── Errors (observability) ───────────────────────────────────────────── */

function errorRow(r: {
  id: number;
  createdAt: Date;
  source: string;
  severity: string;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  provider: string | null;
  model: string | null;
  status: number | null;
  userId: number | null;
  detail: string | null;
}): AdminErrorRow {
  return {
    id: r.id,
    createdAt: epoch(r.createdAt),
    source: r.source,
    severity: r.severity,
    message: r.message,
    stack: r.stack,
    route: r.route,
    method: r.method,
    provider: r.provider,
    model: r.model,
    status: r.status,
    userId: r.userId,
    detail: r.detail,
  };
}

export async function errorOverview(): Promise<AdminErrorOverview> {
  const [last24h, last7d, total, distinctSources] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(errorEvents)
      .where(sql`${errorEvents.createdAt} >= now() - interval '1 days'`),
    db
      .select({ c: sql<number>`count(*)` })
      .from(errorEvents)
      .where(sql`${errorEvents.createdAt} >= now() - interval '7 days'`),
    db.select({ c: sql<number>`count(*)` }).from(errorEvents),
    db
      .select({
        c: sql<number>`count(distinct ${errorEvents.source})`,
      })
      .from(errorEvents),
  ]);

  // Errors per day for the last 30d, split by source.
  const dayRows = await db
    .select({
      day: sql<string>`to_char(${errorEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      source: errorEvents.source,
      c: sql<number>`count(*)`,
    })
    .from(errorEvents)
    .where(sql`${errorEvents.createdAt} >= now() - interval '30 days'`)
    .groupBy(
      sql`to_char(${errorEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      errorEvents.source,
    );

  const sourceSet = new Set<string>();
  const byDayMap = new Map<string, Record<string, number>>();
  for (const r of dayRows) {
    sourceSet.add(r.source);
    const entry = byDayMap.get(r.day) ?? {};
    entry[r.source] = (entry[r.source] ?? 0) + r.c;
    byDayMap.set(r.day, entry);
  }
  const sources = [...sourceSet].sort();
  const errorsByDay: AdminErrorOverview["errorsByDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const bySource = byDayMap.get(d) ?? {};
    const count = Object.values(bySource).reduce((s, n) => s + n, 0);
    errorsByDay.push({ date: d, count, bySource });
  }

  // Last-7d breakdowns by source / model / provider.
  const week = sql`${errorEvents.createdAt} >= now() - interval '7 days'`;
  const [bySourceRows, byModelRows, byProviderRows] = await Promise.all([
    db
      .select({ source: errorEvents.source, c: sql<number>`count(*)` })
      .from(errorEvents)
      .where(week)
      .groupBy(errorEvents.source)
      .orderBy(sql`count(*) desc`),
    db
      .select({ model: errorEvents.model, c: sql<number>`count(*)` })
      .from(errorEvents)
      .where(and(week, sql`${errorEvents.model} is not null`))
      .groupBy(errorEvents.model)
      .orderBy(sql`count(*) desc`)
      .limit(15),
    db
      .select({ provider: errorEvents.provider, c: sql<number>`count(*)` })
      .from(errorEvents)
      .where(and(week, sql`${errorEvents.provider} is not null`))
      .groupBy(errorEvents.provider)
      .orderBy(sql`count(*) desc`)
      .limit(15),
  ]);

  const byModel = byModelRows
    .filter((r) => r.model)
    .map((r) => ({ model: r.model as string, count: r.c }));
  const topFailingModel = byModel.length
    ? { model: byModel[0]!.model, count: byModel[0]!.count }
    : null;

  const recentRows = await db
    .select()
    .from(errorEvents)
    .orderBy(desc(errorEvents.createdAt))
    .limit(20);

  return {
    last24h: countRows(last24h),
    last7d: countRows(last7d),
    total: countRows(total),
    distinctSources: countRows(distinctSources),
    topFailingModel,
    sources,
    errorsByDay,
    bySource: bySourceRows.map((r) => ({ source: r.source, count: r.c })),
    byModel,
    byProvider: byProviderRows
      .filter((r) => r.provider)
      .map((r) => ({ provider: r.provider as string, count: r.c })),
    recent: recentRows.map(errorRow),
  };
}

export async function listErrors(opts: {
  page: number;
  pageSize: number;
  source?: string;
  severity?: string;
  model?: string;
  search?: string;
}): Promise<{ rows: AdminErrorRow[]; total: number }> {
  const { page, pageSize, source, severity, model, search } = opts;
  const conds = [];
  if (source) conds.push(eq(errorEvents.source, source));
  if (severity) conds.push(eq(errorEvents.severity, severity));
  if (model) conds.push(eq(errorEvents.model, model));
  if (search) conds.push(like(errorEvents.message, `%${search}%`));
  const where = conds.length ? and(...conds) : undefined;

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(errorEvents)
    .where(where);

  const rows = await db
    .select()
    .from(errorEvents)
    .where(where)
    .orderBy(desc(errorEvents.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);

  return { total: countRows(totalRows), rows: rows.map(errorRow) };
}

/* ── Generations (latency / throughput observability) ─────────────────── */

/** Percentile (0..1) of a numeric array via nearest-rank. Returns 0 if empty. */
function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(p * sorted.length) - 1),
  );
  return sorted[idx]!;
}

function genRow(r: {
  id: number;
  createdAt: Date;
  provider: string;
  model: string;
  routerModel: string | null;
  durationMs: number;
  success: boolean;
  audioBytes: number;
  textLength: number | null;
  status: number | null;
  error: string | null;
  userId: number | null;
}): AdminGenerationRow {
  return {
    id: r.id,
    createdAt: epoch(r.createdAt),
    provider: r.provider,
    model: r.model,
    routerModel: r.routerModel,
    durationMs: r.durationMs,
    success: r.success,
    audioBytes: r.audioBytes,
    textLength: r.textLength,
    status: r.status,
    error: r.error,
    userId: r.userId,
  };
}

export async function generationOverview(): Promise<AdminGenerationOverview> {
  const [c24, c7] = await Promise.all([
    db
      .select({ c: sql<number>`count(*)` })
      .from(generationEvents)
      .where(sql`${generationEvents.createdAt} >= now() - interval '1 days'`),
    db
      .select({ c: sql<number>`count(*)` })
      .from(generationEvents)
      .where(sql`${generationEvents.createdAt} >= now() - interval '7 days'`),
  ]);

  // Pull raw 7d rows for percentile math (percentiles aren't native in SQLite).
  const week7 = await db
    .select({
      day: sql<string>`to_char(${generationEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      durationMs: generationEvents.durationMs,
      success: generationEvents.success,
      provider: generationEvents.provider,
      model: generationEvents.model,
    })
    .from(generationEvents)
    .where(sql`${generationEvents.createdAt} >= now() - interval '7 days'`);

  const all7 = week7.map((r) => r.durationMs).sort((a, b) => a - b);
  const success7 = week7.filter((r) => r.success).length;

  // Per-model 7d latency + reliability.
  type Acc = { provider: string; durs: number[]; failures: number };
  const perModel = new Map<string, Acc>();
  for (const r of week7) {
    let acc = perModel.get(r.model);
    if (!acc) {
      acc = { provider: r.provider, durs: [], failures: 0 };
      perModel.set(r.model, acc);
    }
    acc.durs.push(r.durationMs);
    if (!r.success) acc.failures += 1;
  }
  const byModel: AdminGenModelStat[] = [...perModel.entries()]
    .map(([model, acc]) => {
      const sorted = [...acc.durs].sort((a, b) => a - b);
      const total = sorted.length;
      const avg = total
        ? Math.round(sorted.reduce((s, n) => s + n, 0) / total)
        : 0;
      return {
        model,
        provider: acc.provider,
        total,
        failures: acc.failures,
        successRate: total ? ((total - acc.failures) / total) * 100 : 0,
        p50: percentile(sorted, 0.5),
        p95: percentile(sorted, 0.95),
        avg,
      };
    })
    .sort((a, b) => b.p95 - a.p95);

  // Per-day throughput + latency over 30d (raw rows, bucketed in JS).
  const month = await db
    .select({
      day: sql<string>`to_char(${generationEvents.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`,
      durationMs: generationEvents.durationMs,
      success: generationEvents.success,
    })
    .from(generationEvents)
    .where(sql`${generationEvents.createdAt} >= now() - interval '30 days'`);
  const dayMap = new Map<string, { durs: number[]; failures: number }>();
  for (const r of month) {
    let e = dayMap.get(r.day);
    if (!e) {
      e = { durs: [], failures: 0 };
      dayMap.set(r.day, e);
    }
    e.durs.push(r.durationMs);
    if (!r.success) e.failures += 1;
  }
  const byDay: AdminGenerationOverview["byDay"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10);
    const e = dayMap.get(d);
    const sorted = e ? [...e.durs].sort((a, b) => a - b) : [];
    byDay.push({
      date: d,
      total: sorted.length,
      failures: e?.failures ?? 0,
      p50: percentile(sorted, 0.5),
      p95: percentile(sorted, 0.95),
    });
  }

  const recentFailRows = await db
    .select()
    .from(generationEvents)
    .where(eq(generationEvents.success, false))
    .orderBy(desc(generationEvents.createdAt))
    .limit(20);

  return {
    last24h: countRows(c24),
    last7d: countRows(c7),
    successRate7d: week7.length ? (success7 / week7.length) * 100 : 0,
    p50: percentile(all7, 0.5),
    p95: percentile(all7, 0.95),
    byDay,
    byModel,
    recentFailures: recentFailRows.map(genRow),
  };
}

export async function listGenerations(opts: {
  page: number;
  pageSize: number;
  model?: string;
  provider?: string;
  failedOnly?: boolean;
}): Promise<{ rows: AdminGenerationRow[]; total: number }> {
  const { page, pageSize, model, provider, failedOnly } = opts;
  const conds = [];
  if (model) conds.push(eq(generationEvents.model, model));
  if (provider) conds.push(eq(generationEvents.provider, provider));
  if (failedOnly) conds.push(eq(generationEvents.success, false));
  const where = conds.length ? and(...conds) : undefined;

  const totalRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(generationEvents)
    .where(where);

  const rows = await db
    .select()
    .from(generationEvents)
    .where(where)
    .orderBy(desc(generationEvents.createdAt))
    .limit(pageSize)
    .offset(page * pageSize);

  return { total: countRows(totalRows), rows: rows.map(genRow) };
}

/** Quarantine/un-quarantine a user, then recompute ratings. */
export async function setUserQuarantine(
  userId: number,
  quarantined: boolean,
): Promise<boolean> {
  const updated = await withWriteRetry(() =>
    db
      .update(users)
      .set({ quarantined })
      .where(eq(users.id, userId))
      .returning({ id: users.id }),
  );
  if (updated.length === 0) return false;
  await logSecurityEvent({
    kind: quarantined ? "manual_quarantine" : "manual_unquarantine",
    severity: "warn",
    userId,
  });
  await recomputeFromCleanVotes();
  invalidateBTCache();
  return true;
}
