/**
 * Zod schemas + types for the web app's HTTP API (browser ↔ Next.js route
 * handlers). One source of truth so the client and server can't drift.
 */
import { z } from "zod";

export const MAX_TEXT_LENGTH = 1000;
export const SESSION_TTL_SECONDS = 30 * 60;

/* ── Auth ─────────────────────────────────────────────────────────────── */

export const userSchema = z.object({
  id: z.number().int(),
  username: z.string(),
  hfId: z.string(),
  avatarUrl: z.string().nullable(),
  showInLeaderboard: z.boolean(),
  isAdmin: z.boolean(),
});
export type ApiUser = z.infer<typeof userSchema>;

export const meResponseSchema = z.object({
  user: userSchema.nullable(),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

/* ── TTS generate ─────────────────────────────────────────────────────── */

export const ttsGenerateRequestSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
});
export type TTSGenerateRequest = z.infer<typeof ttsGenerateRequestSchema>;

export const conversationalLineSchema = z.object({
  text: z.string().trim().min(1).max(MAX_TEXT_LENGTH),
  speaker: z.union([z.literal(0), z.literal(1)]),
});
export type ConversationalLine = z.infer<typeof conversationalLineSchema>;

export const conversationalGenerateRequestSchema = z.object({
  script: z.array(conversationalLineSchema).min(2),
});
export type ConversationalGenerateRequest = z.infer<
  typeof conversationalGenerateRequestSchema
>;

export const generateResponseSchema = z.object({
  sessionId: z.string().uuid(),
  audioA: z.string(),
  audioB: z.string(),
  expiresIn: z.number().int(),
});
export type GenerateResponse = z.infer<typeof generateResponseSchema>;

/* ── Vote ─────────────────────────────────────────────────────────────── */

export const voteRequestSchema = z.object({
  sessionId: z.string().uuid(),
  chosen: z.union([z.literal("a"), z.literal("b")]),
});
export type VoteRequest = z.infer<typeof voteRequestSchema>;

export const revealedModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  open: z.boolean(),
  url: z.string(),
});

export const voteResponseSchema = z.object({
  chosen: revealedModelSchema,
  rejected: revealedModelSchema,
  /** Whether this vote affected the public Elo board. */
  counted: z.boolean(),
});
export type VoteResponse = z.infer<typeof voteResponseSchema>;

/* ── Leaderboard ──────────────────────────────────────────────────────── */

export const leaderboardRowSchema = z.object({
  rank: z.number().int(),
  id: z.string(),
  name: z.string(),
  url: z.string(),
  elo: z.number().int(),
  winRate: z.number(), // 0–100
  totalVotes: z.number().int(),
  tier: z.enum(["S", "A", "B"]).nullable(),
  open: z.boolean(),
});
export type LeaderboardRow = z.infer<typeof leaderboardRowSchema>;

export const leaderboardResponseSchema = z.object({
  rows: z.array(leaderboardRowSchema),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

export const topVoterSchema = z.object({
  rank: z.number().int(),
  username: z.string(),
  voteCount: z.number().int(),
});
export type TopVoter = z.infer<typeof topVoterSchema>;

/* ── Sentences ────────────────────────────────────────────────────────── */

export const randomSentenceResponseSchema = z.object({
  sentence: z.string(),
});
export type RandomSentenceResponse = z.infer<
  typeof randomSentenceResponseSchema
>;

export const sentenceStatsSchema = z.object({
  total: z.number().int(),
  consumed: z.number().int(),
  remaining: z.number().int(),
  consumptionPct: z.number(),
});
export type SentenceStats = z.infer<typeof sentenceStatsSchema>;

/* ── Errors ───────────────────────────────────────────────────────────── */

export const errorResponseSchema = z.object({
  error: z.string(),
  detail: z.string().optional(),
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;
