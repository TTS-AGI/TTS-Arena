/**
 * Admin data layer — Drizzle queries backing the /api/admin routes. Pure data
 * access over the shared `db`; no auth here (routes/layout gate via
 * requireAdmin). Timestamps are returned as unix-epoch seconds (the column
 * mode is "timestamp" → JS Date; we convert to epoch for the JSON contract).
 */
import { and, asc, desc, eq, like, sql } from "drizzle-orm";
import type {
  AdminAnalytics,
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
  models,
  ratingHistory,
  securityEvents,
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
  const since = sql`unixepoch('now', '-${sql.raw(String(days))} days')`;
  const cond = extra
    ? and(sql`${votes.createdAt} >= ${since}`, extra)
    : sql`${votes.createdAt} >= ${since}`;
  const rows = await db
    .select({
      day: sql<string>`date(${votes.createdAt}, 'unixepoch')`,
      c: sql<number>`count(*)`,
      f: sql<number>`sum(case when ${votes.flagged} then 1 else 0 end)`,
    })
    .from(votes)
    .where(cond)
    .groupBy(sql`date(${votes.createdAt}, 'unixepoch')`);
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
      day: sql<string>`date(${votes.createdAt}, 'unixepoch')`,
      c: sql<number>`count(*)`,
    })
    .from(votes)
    .where(sql`${votes.createdAt} >= unixepoch('now', '-30 days')`)
    .groupBy(sql`date(${votes.createdAt}, 'unixepoch')`);
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
      isOpen: m.isOpen,
      isActive: m.isActive,
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

export async function updateModel(
  id: string,
  patch: { name?: string; url?: string; icon?: string; isActive?: boolean },
): Promise<boolean> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.url !== undefined) set.url = patch.url || null;
  if (patch.icon !== undefined) set.icon = patch.icon || null;
  if (patch.isActive !== undefined) set.isActive = patch.isActive;

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

  // Top voters for this model (chose it) + their flagged share.
  const voterRows = await db
    .select({
      userId: votes.userId,
      username: users.username,
      votes: sql<number>`count(*)`,
      flagged: sql<number>`sum(case when ${votes.flagged} then 1 else 0 end)`,
    })
    .from(votes)
    .innerJoin(users, eq(votes.userId, users.id))
    .where(eq(votes.chosenModelId, id))
    .groupBy(votes.userId, users.username)
    .orderBy(sql`count(*) desc`)
    .limit(10);

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
    topVoters: voterRows.map((v) => ({
      userId: v.userId,
      username: v.username,
      votes: v.votes,
      flagged: v.flagged ?? 0,
    })),
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
      .map((r) => ({ ip: r.ip as string, accounts: r.accounts, events: 0 })),
    recentEvents: recentEventRows.map(eventRow),
    quarantined: quarantinedRows.map((q) => ({
      id: q.id,
      username: q.username,
      trustScore: q.trustScore,
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
