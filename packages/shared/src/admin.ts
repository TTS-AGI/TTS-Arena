/**
 * Admin panel API types. Response shapes for /api/admin/*; consumed by the
 * admin UI. Kept in @ttsa/shared so client and server agree on the contract.
 */
import { z } from "zod";

/* ── Shared time series ───────────────────────────────────────────────── */

export const timePointSchema = z.object({
  date: z.string(),
  count: z.number().int(),
  flagged: z.number().int().optional(),
});
export type TimePoint = z.infer<typeof timePointSchema>;

/* ── Overview ─────────────────────────────────────────────────────────── */

export const adminOverviewSchema = z.object({
  totals: z.object({
    users: z.number().int(),
    votes: z.number().int(),
    models: z.number().int(),
    activeModels: z.number().int(),
  }),
  /** Vote count per day for the last 30 days, oldest first. */
  votesByDay: z.array(z.object({ date: z.string(), count: z.number().int() })),
  recentVotes: z.array(
    z.object({
      id: z.number().int(),
      createdAt: z.number().int(),
      username: z.string(),
      chosenModel: z.string(),
      rejectedModel: z.string(),
      text: z.string(),
    }),
  ),
  recentUsers: z.array(
    z.object({
      id: z.number().int(),
      username: z.string(),
      avatarUrl: z.string().nullable(),
      joinDate: z.number().int(),
    }),
  ),
});
export type AdminOverview = z.infer<typeof adminOverviewSchema>;

/* ── Models ───────────────────────────────────────────────────────────── */

export const adminModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  modelType: z.string(),
  isOpen: z.boolean(),
  isActive: z.boolean(),
  url: z.string().nullable(),
  icon: z.string().nullable(),
  rating: z.number(),
  ratingDeviation: z.number(),
  volatility: z.number(),
  winCount: z.number().int(),
  matchCount: z.number().int(),
  voteCount: z.number().int(),
  updatedAt: z.number().int(),
});
export type AdminModel = z.infer<typeof adminModelSchema>;

export const adminModelsResponseSchema = z.object({
  models: z.array(adminModelSchema),
});
export type AdminModelsResponse = z.infer<typeof adminModelsResponseSchema>;

/** PATCH body for editing a model's display/active metadata. */
export const adminModelUpdateSchema = z.object({
  name: z.string().min(1).optional(),
  url: z.string().optional(),
  icon: z.string().optional(),
  isActive: z.boolean().optional(),
});
export type AdminModelUpdate = z.infer<typeof adminModelUpdateSchema>;

/* ── Users ────────────────────────────────────────────────────────────── */

export const adminUserRowSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  avatarUrl: z.string().nullable(),
  email: z.string().nullable(),
  joinDate: z.number().int(),
  hfAccountCreated: z.number().int().nullable(),
  voteCount: z.number().int(),
});
export type AdminUserRow = z.infer<typeof adminUserRowSchema>;

export const adminUsersResponseSchema = z.object({
  rows: z.array(adminUserRowSchema),
  total: z.number().int(),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

export const adminUserDetailSchema = z.object({
  user: adminUserRowSchema.extend({
    hfId: z.string(),
    trustScore: z.number(),
    quarantined: z.boolean(),
  }),
  /** Flagged-vote count for this user (fraud lens). */
  flaggedVotes: z.number().int(),
  /** Votes per day (clean vs flagged), last 30d. */
  votesByDay: z.array(timePointSchema),
  /** Distribution of which model the user picks (bias lens). */
  choiceDistribution: z.array(
    z.object({ model: z.string(), count: z.number().int() }),
  ),
  logins: z.array(
    z.object({
      id: z.number().int(),
      ip: z.string().nullable(),
      userAgent: z.string().nullable(),
      fingerprint: z.string().nullable(),
      createdAt: z.number().int(),
    }),
  ),
  votes: z.array(
    z.object({
      id: z.number().int(),
      createdAt: z.number().int(),
      chosenModel: z.string(),
      rejectedModel: z.string(),
      flagged: z.boolean(),
      riskScore: z.number(),
      text: z.string(),
    }),
  ),
});
export type AdminUserDetail = z.infer<typeof adminUserDetailSchema>;

/* ── Votes ────────────────────────────────────────────────────────────── */

export const adminVoteRowSchema = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  username: z.string(),
  modelType: z.string(),
  chosenModel: z.string(),
  rejectedModel: z.string(),
  chosenVoice: z.string().nullable(),
  rejectedVoice: z.string().nullable(),
  sentenceOrigin: z.string(),
  countsForPublic: z.boolean(),
  flagged: z.boolean(),
  riskScore: z.number(),
  text: z.string(),
});
export type AdminVoteRow = z.infer<typeof adminVoteRowSchema>;

export const adminVotesResponseSchema = z.object({
  rows: z.array(adminVoteRowSchema),
  total: z.number().int(),
});
export type AdminVotesResponse = z.infer<typeof adminVotesResponseSchema>;

/* ── Analytics ────────────────────────────────────────────────────────── */

export const adminAnalyticsSchema = z.object({
  sentencePool: z.object({
    total: z.number().int(),
    consumed: z.number().int(),
    remaining: z.number().int(),
    consumptionPct: z.number(),
  }),
  votesByOrigin: z.array(
    z.object({ origin: z.string(), count: z.number().int() }),
  ),
  topModelsByVotes: z.array(
    z.object({ id: z.string(), name: z.string(), votes: z.number().int() }),
  ),
  topVoices: z.array(
    z.object({
      modelId: z.string(),
      voice: z.string(),
      winCount: z.number().int(),
      matchCount: z.number().int(),
    }),
  ),
});
export type AdminAnalytics = z.infer<typeof adminAnalyticsSchema>;

/* ── Model detail (drill-down) ────────────────────────────────────────── */

export const adminModelDetailSchema = z.object({
  model: adminModelSchema,
  rank: z.number().int(),
  flaggedVotes: z.number().int(),
  /** Rating + RD over time, one point per recorded match. */
  ratingHistory: z.array(
    z.object({
      t: z.number().int(),
      rating: z.number(),
      rd: z.number(),
    }),
  ),
  /** Votes per day where this model appeared (clean vs flagged). */
  votesByDay: z.array(timePointSchema),
  /** Win/loss vs each opponent (top by total). */
  vsOpponents: z.array(
    z.object({
      opponent: z.string(),
      wins: z.number().int(),
      losses: z.number().int(),
      winRate: z.number(),
    }),
  ),
  /** Top voters for this model + their flagged share (fraud lens). */
  topVoters: z.array(
    z.object({
      userId: z.number().int(),
      username: z.string(),
      votes: z.number().int(),
      flagged: z.number().int(),
    }),
  ),
  recentVotes: z.array(adminVoteRowSchema),
});
export type AdminModelDetail = z.infer<typeof adminModelDetailSchema>;

/* ── Security ─────────────────────────────────────────────────────────── */

export const adminSecurityEventSchema = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  kind: z.string(),
  severity: z.string(),
  userId: z.number().int().nullable(),
  username: z.string().nullable(),
  ip: z.string().nullable(),
  fingerprint: z.string().nullable(),
  voteId: z.number().int().nullable(),
  detail: z.string().nullable(),
});
export type AdminSecurityEvent = z.infer<typeof adminSecurityEventSchema>;

export const adminSecurityOverviewSchema = z.object({
  flaggedVotes: z.number().int(),
  totalVotes: z.number().int(),
  quarantinedUsers: z.number().int(),
  eventsBySeverity: z.array(
    z.object({ severity: z.string(), count: z.number().int() }),
  ),
  topRiskyIps: z.array(
    z.object({
      ip: z.string(),
      accounts: z.number().int(),
      events: z.number().int(),
    }),
  ),
  recentEvents: z.array(adminSecurityEventSchema),
  quarantined: z.array(
    z.object({
      id: z.number().int(),
      username: z.string(),
      trustScore: z.number(),
    }),
  ),
});
export type AdminSecurityOverview = z.infer<typeof adminSecurityOverviewSchema>;

export const adminSecurityEventsResponseSchema = z.object({
  rows: z.array(adminSecurityEventSchema),
  total: z.number().int(),
});
export type AdminSecurityEventsResponse = z.infer<
  typeof adminSecurityEventsResponseSchema
>;

/* ── Errors (observability) ───────────────────────────────────────────── */

export const adminErrorRowSchema = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  source: z.string(),
  severity: z.string(),
  message: z.string(),
  stack: z.string().nullable(),
  route: z.string().nullable(),
  method: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: z.number().int().nullable(),
  userId: z.number().int().nullable(),
  detail: z.string().nullable(),
});
export type AdminErrorRow = z.infer<typeof adminErrorRowSchema>;

export const adminErrorsResponseSchema = z.object({
  rows: z.array(adminErrorRowSchema),
  total: z.number().int(),
});
export type AdminErrorsResponse = z.infer<typeof adminErrorsResponseSchema>;

/** One day of error counts, split by source (for the stacked trend chart). */
export const adminErrorDaySchema = z.object({
  date: z.string(),
  /** Total across all sources for the day. */
  count: z.number().int(),
  /** Per-source counts; keys are source names present that day. */
  bySource: z.record(z.string(), z.number().int()),
});
export type AdminErrorDay = z.infer<typeof adminErrorDaySchema>;

export const adminErrorOverviewSchema = z.object({
  last24h: z.number().int(),
  last7d: z.number().int(),
  total: z.number().int(),
  distinctSources: z.number().int(),
  /** Highest-volume failing model in the last 7d (null if none). */
  topFailingModel: z
    .object({ model: z.string(), count: z.number().int() })
    .nullable(),
  /** Source names that appear in errorsByDay (chart series + legend). */
  sources: z.array(z.string()),
  /** Errors per day for the last 30d, oldest first, stacked by source. */
  errorsByDay: z.array(adminErrorDaySchema),
  /** Failures grouped by source, last 7d. */
  bySource: z.array(z.object({ source: z.string(), count: z.number().int() })),
  /** Failures grouped by model, last 7d (top by count). */
  byModel: z.array(z.object({ model: z.string(), count: z.number().int() })),
  /** Failures grouped by provider, last 7d. */
  byProvider: z.array(
    z.object({ provider: z.string(), count: z.number().int() }),
  ),
  recent: z.array(adminErrorRowSchema),
});
export type AdminErrorOverview = z.infer<typeof adminErrorOverviewSchema>;

/* ── Generations (latency / throughput observability) ─────────────────── */

/** Per-model latency + reliability summary over a window. */
export const adminGenModelStatSchema = z.object({
  model: z.string(),
  provider: z.string(),
  total: z.number().int(),
  failures: z.number().int(),
  successRate: z.number(), // 0..100
  p50: z.number().int(), // ms
  p95: z.number().int(), // ms
  avg: z.number().int(), // ms
});
export type AdminGenModelStat = z.infer<typeof adminGenModelStatSchema>;

/** One day of generation throughput + latency. */
export const adminGenDaySchema = z.object({
  date: z.string(),
  total: z.number().int(),
  failures: z.number().int(),
  /** Median latency that day (ms). */
  p50: z.number().int(),
  /** 95th-percentile latency that day (ms). */
  p95: z.number().int(),
});
export type AdminGenDay = z.infer<typeof adminGenDaySchema>;

export const adminGenerationRowSchema = z.object({
  id: z.number().int(),
  createdAt: z.number().int(),
  provider: z.string(),
  model: z.string(),
  routerModel: z.string().nullable(),
  durationMs: z.number().int(),
  success: z.boolean(),
  audioBytes: z.number().int(),
  textLength: z.number().int().nullable(),
  status: z.number().int().nullable(),
  error: z.string().nullable(),
  userId: z.number().int().nullable(),
});
export type AdminGenerationRow = z.infer<typeof adminGenerationRowSchema>;

export const adminGenerationsResponseSchema = z.object({
  rows: z.array(adminGenerationRowSchema),
  total: z.number().int(),
});
export type AdminGenerationsResponse = z.infer<
  typeof adminGenerationsResponseSchema
>;

export const adminGenerationOverviewSchema = z.object({
  last24h: z.number().int(),
  last7d: z.number().int(),
  /** Overall success rate over the last 7d (0..100). */
  successRate7d: z.number(),
  /** Overall P50 / P95 latency over the last 7d (ms). */
  p50: z.number().int(),
  p95: z.number().int(),
  /** Throughput + latency per day for the last 30d, oldest first. */
  byDay: z.array(adminGenDaySchema),
  /** Per-model latency + reliability over the last 7d (sorted slowest first). */
  byModel: z.array(adminGenModelStatSchema),
  /** Recent failed generations. */
  recentFailures: z.array(adminGenerationRowSchema),
});
export type AdminGenerationOverview = z.infer<
  typeof adminGenerationOverviewSchema
>;
