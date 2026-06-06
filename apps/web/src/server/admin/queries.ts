/**
 * Admin data layer — Drizzle queries backing the /api/admin routes. Pure data
 * access over the shared `db`; no auth here (routes/layout gate via
 * requireAdmin). Timestamps are returned as unix-epoch seconds (the column
 * mode is "timestamp" → JS Date; we convert to epoch for the JSON contract).
 */
import { and, desc, eq, like, sql } from "drizzle-orm";
import type {
  AdminAnalytics,
  AdminModel,
  AdminOverview,
  AdminUserDetail,
  AdminUserRow,
  AdminVoteRow,
} from "@ttsa/shared";
import { db, withWriteRetry } from "../db/client";
import { models, userLogins, users, voiceStats, votes } from "../db/schema";
import { sentenceStats } from "../arena/sentences";

const epoch = (d: Date | null): number =>
  d ? Math.floor(d.getTime() / 1000) : 0;

function countRows(rows: { c: number }[]): number {
  return rows[0]?.c ?? 0;
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
      text: votes.text,
    })
    .from(votes)
    .where(eq(votes.userId, id))
    .orderBy(desc(votes.createdAt))
    .limit(50);

  const voteCountRows = await db
    .select({ c: sql<number>`count(*)` })
    .from(votes)
    .where(eq(votes.userId, id));

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
    },
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
      text: v.text,
    })),
  };
}

/* ── Votes ────────────────────────────────────────────────────────────── */

export async function listVotes(opts: {
  page: number;
  pageSize: number;
  modelType?: string;
  userId?: number;
}): Promise<{ rows: AdminVoteRow[]; total: number }> {
  const { page, pageSize, modelType, userId } = opts;
  const conds = [];
  if (modelType) conds.push(eq(votes.modelType, modelType));
  if (userId !== undefined) conds.push(eq(votes.userId, userId));
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
