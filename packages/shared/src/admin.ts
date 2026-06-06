/**
 * Admin panel API types. Response shapes for /api/admin/*; consumed by the
 * admin UI. Kept in @ttsa/shared so client and server agree on the contract.
 */
import { z } from "zod";

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
  user: adminUserRowSchema.extend({ hfId: z.string() }),
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
