/**
 * Database schema (Drizzle, SQLite).
 *
 * Models the TTS arena cleanly: users, models with live Glicko-2 ratings,
 * votes, a rating-history trail, per-voice stats, single-use sentences, and
 * battle sessions. The old security/anti-abuse tables are intentionally
 * omitted.
 *
 * SQLite is used so the database is a single file the HF persistent bucket can
 * store reliably (Postgres' data dir didn't survive the bucket sync).
 * Booleans are stored as integers; timestamps as unix-epoch integers.
 */
import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const now = sql`(unixepoch())`;

/* ── Users ────────────────────────────────────────────────────────────── */
export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  username: text("username").notNull().unique(),
  /** Hugging Face account id (stable across username changes). */
  hfId: text("hf_id").notNull().unique(),
  joinDate: integer("join_date", { mode: "timestamp" }).notNull().default(now),
  /** HF account creation date, used for the sign-in age gate. */
  hfAccountCreated: integer("hf_account_created", { mode: "timestamp" }),
  /** Email from the HF `email` OAuth scope (logged, not displayed). */
  email: text("email"),
  /** Absolute HF avatar URL. */
  avatarUrl: text("avatar_url"),
  showInLeaderboard: integer("show_in_leaderboard", { mode: "boolean" })
    .notNull()
    .default(true),

  // ── Anti-fraud ──
  /** Trust score 0–100 (100 = fully trusted); lowered by the security sweep. */
  trustScore: real("trust_score").notNull().default(100),
  /** When true, none of the user's votes count toward public ratings. */
  quarantined: integer("quarantined", { mode: "boolean" })
    .notNull()
    .default(false),
});

/* ── User logins (full history for abuse investigation) ───────────────── */
export const userLogins = sqliteTable(
  "user_logins",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    /** Full client IP (resolved from forwarding headers). */
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** FingerprintJS visitor id supplied by the client. */
    fingerprint: text("fingerprint"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byUser: index("user_logins_user_idx").on(t.userId),
    byIp: index("user_logins_ip_idx").on(t.ip),
    byFingerprint: index("user_logins_fingerprint_idx").on(t.fingerprint),
  }),
);

/* ── Models ───────────────────────────────────────────────────────────── */
export const models = sqliteTable("models", {
  /** Arena slug, e.g. "eleven-multilingual-v2". Matches @ttsa/shared MODELS. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** "tts" | "conversational". */
  modelType: text("model_type").notNull(),
  isOpen: integer("is_open", { mode: "boolean" }).notNull().default(false),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  url: text("url"),
  /** Optional provider logo URL shown on the leaderboard. */
  icon: text("icon"),

  // ── Live Glicko-2 state ──
  /** Display rating (Glicko-2, centered on 1500). */
  rating: real("rating").notNull().default(1500),
  /** Rating deviation — uncertainty; high until enough games are played. */
  ratingDeviation: real("rating_deviation").notNull().default(350),
  /** Volatility — expected fluctuation in performance. */
  volatility: real("volatility").notNull().default(0.06),

  // ── Denormalized counters (cheap reads; derived from votes) ──
  winCount: integer("win_count").notNull().default(0),
  matchCount: integer("match_count").notNull().default(0),

  updatedAt: integer("updated_at", { mode: "timestamp" })
    .notNull()
    .default(now),
});

/* ── Votes ────────────────────────────────────────────────────────────── */
export const votes = sqliteTable(
  "votes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    modelType: text("model_type").notNull(),

    chosenModelId: text("chosen_model_id")
      .notNull()
      .references(() => models.id),
    rejectedModelId: text("rejected_model_id")
      .notNull()
      .references(() => models.id),

    /** Provider-scoped voice ids actually used, for per-voice analytics. */
    chosenVoice: text("chosen_voice"),
    rejectedVoice: text("rejected_voice"),

    /**
     * Paths (in the /audio bucket) to the pre-normalization audio for each
     * side, retained for a future preference dataset.
     */
    chosenAudioPath: text("chosen_audio_path"),
    rejectedAudioPath: text("rejected_audio_path"),

    /** SHA-256 of the trimmed prompt; ties votes to the sentence pool. */
    sentenceHash: text("sentence_hash"),
    /** "dataset" | "custom". */
    sentenceOrigin: text("sentence_origin").notNull(),
    /** Whether this vote affects public ratings (the anti-fraud gate). */
    countsForPublic: integer("counts_for_public", { mode: "boolean" })
      .notNull()
      .default(true),

    // ── Anti-fraud audit trail ──
    /** Risk score assigned at vote time (0 = clean; higher = more suspicious). */
    riskScore: real("risk_score").notNull().default(0),
    /** JSON array of reason codes that contributed to the risk score. */
    riskReasons: text("risk_reasons"),
    /** True if flagged as suspicious (inline or by the sweep). */
    flagged: integer("flagged", { mode: "boolean" }).notNull().default(false),

    /** Seconds between generation and vote (engagement signal). */
    sessionDurationSeconds: real("session_duration_seconds"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byUser: index("votes_user_idx").on(t.userId),
    byChosen: index("votes_chosen_idx").on(t.chosenModelId),
    byRejected: index("votes_rejected_idx").on(t.rejectedModelId),
    byType: index("votes_type_idx").on(t.modelType),
    bySentence: index("votes_sentence_idx").on(t.sentenceHash),
    // Velocity checks: votes by a user over a recent window.
    byUserTime: index("votes_user_time_idx").on(t.userId, t.createdAt),
    byFlagged: index("votes_flagged_idx").on(t.flagged),
  }),
);

/* ── Rating history ───────────────────────────────────────────────────── */
export const ratingHistory = sqliteTable(
  "rating_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    modelType: text("model_type").notNull(),
    rating: real("rating").notNull(),
    ratingDeviation: real("rating_deviation").notNull(),
    voteId: integer("vote_id").references(() => votes.id),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byModel: index("rating_history_model_idx").on(t.modelId),
    byTime: index("rating_history_time_idx").on(t.createdAt),
  }),
);

/* ── Per-voice stats ──────────────────────────────────────────────────── */
export const voiceStats = sqliteTable(
  "voice_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    voice: text("voice").notNull(),
    winCount: integer("win_count").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    uniqModelVoice: uniqueIndex("voice_stats_model_voice_idx").on(
      t.modelId,
      t.voice,
    ),
  }),
);

/* ── Consumed sentences (single-use dataset prompts) ──────────────────── */
export const consumedSentences = sqliteTable("consumed_sentences", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  sentenceHash: text("sentence_hash").notNull().unique(),
  sentenceText: text("sentence_text").notNull(),
  consumedAt: integer("consumed_at", { mode: "timestamp" })
    .notNull()
    .default(now),
});

/* ── Battle sessions ──────────────────────────────────────────────────── */
export const battleSessions = sqliteTable(
  "battle_sessions",
  {
    /** Opaque session id (uuid) handed to the client. */
    id: text("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    modelType: text("model_type").notNull(),
    text: text("text").notNull(),
    sentenceHash: text("sentence_hash").notNull(),
    /** "dataset" (from the prompt pool) | "custom" (user-typed). */
    sentenceOrigin: text("sentence_origin").notNull().default("custom"),

    aModelId: text("a_model_id").notNull(),
    aVoice: text("a_voice").notNull(),
    aPath: text("a_path").notNull(),
    aExt: text("a_ext").notNull(),
    aLogPath: text("a_log_path"),

    bModelId: text("b_model_id").notNull(),
    bVoice: text("b_voice").notNull(),
    bPath: text("b_path").notNull(),
    bExt: text("b_ext").notNull(),
    bLogPath: text("b_log_path"),

    voted: integer("voted", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  },
  (t) => ({
    byExpiry: index("battle_sessions_expiry_idx").on(t.expiresAt),
  }),
);

/* ── Security events (anti-fraud audit feed) ──────────────────────────── */
export const securityEvents = sqliteTable(
  "security_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Subject user, when the event is tied to one. */
    userId: integer("user_id").references(() => users.id),
    /** IP / fingerprint involved, for cluster events. */
    ip: text("ip"),
    fingerprint: text("fingerprint"),
    /** Event code, e.g. "rapid_votes", "ip_cluster", "manual_flag". */
    kind: text("kind").notNull(),
    /** "info" | "warn" | "critical". */
    severity: text("severity").notNull().default("info"),
    /** Free-form JSON context (counts, model id, related users, …). */
    detail: text("detail"),
    /** Related vote, when applicable. */
    voteId: integer("vote_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byTime: index("security_events_time_idx").on(t.createdAt),
    byKind: index("security_events_kind_idx").on(t.kind),
    bySeverity: index("security_events_severity_idx").on(t.severity),
    byUser: index("security_events_user_idx").on(t.userId),
  }),
);

/* ── Error events (observability — every caught error, persisted) ─────── */
export const errorEvents = sqliteTable(
  "error_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Where it happened, e.g. "tts_generate", "router_synth", "api". */
    source: text("source").notNull(),
    /** "warn" | "error" | "fatal". */
    severity: text("severity").notNull().default("error"),
    message: text("message").notNull(),
    /** Stack trace (truncated). */
    stack: text("stack"),
    /** Request path + method, when in a route. */
    route: text("route"),
    method: text("method"),
    /** Provider/model in play (powers "which models fail most"). */
    provider: text("provider"),
    model: text("model"),
    /** Upstream/HTTP status, when relevant. */
    status: integer("status"),
    /** Acting user, when known. */
    userId: integer("user_id"),
    /** Free-form JSON context. */
    detail: text("detail"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byTime: index("error_events_time_idx").on(t.createdAt),
    bySource: index("error_events_source_idx").on(t.source),
    bySeverity: index("error_events_severity_idx").on(t.severity),
    byModel: index("error_events_model_idx").on(t.model),
  }),
);

/* ── Generation events (latency / throughput observability) ──────────── */
/**
 * One row per individual model synthesis attempt (each side of a battle is its
 * own row). This is the granular unit latency lives at: how long a provider
 * took, whether it succeeded, and how much audio came back — powering per-model
 * P50/P95 latency, success rate, and throughput trends in the admin panel.
 */
export const generationEvents = sqliteTable(
  "generation_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    provider: text("provider").notNull(),
    /** Stable arena model id (FK-shaped, not enforced — models may be reseeded). */
    model: text("model").notNull(),
    /** The provider-side router model actually invoked. */
    routerModel: text("router_model"),
    /** Wall-clock synthesis time in milliseconds. */
    durationMs: integer("duration_ms").notNull(),
    /** Did the synth succeed? */
    success: integer("success", { mode: "boolean" }).notNull(),
    /** Bytes of audio returned (0 on failure). */
    audioBytes: integer("audio_bytes").notNull().default(0),
    /** Input text length (chars) — latency tends to scale with it. */
    textLength: integer("text_length"),
    /** Upstream status when the attempt failed via a non-OK response. */
    status: integer("status"),
    /** Short failure reason (provider message), when not successful. */
    error: text("error"),
    /** Acting user, when known. */
    userId: integer("user_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .default(now),
  },
  (t) => ({
    byTime: index("generation_events_time_idx").on(t.createdAt),
    byModel: index("generation_events_model_idx").on(t.model),
    byProvider: index("generation_events_provider_idx").on(t.provider),
    bySuccess: index("generation_events_success_idx").on(t.success),
  }),
);

/* ── Cap.js captcha storage (proof-of-work; no Redis needed) ──────────── */
export const capChallenges = sqliteTable("cap_challenges", {
  token: text("token").primaryKey(),
  data: text("data").notNull(),
  /** Expiry as unix-epoch milliseconds (Cap uses ms timestamps). */
  expires: integer("expires").notNull(),
});

export const capTokens = sqliteTable("cap_tokens", {
  key: text("key").primaryKey(),
  expires: integer("expires").notNull(),
});

/* ── Relations ────────────────────────────────────────────────────────── */
export const usersRelations = relations(users, ({ many }) => ({
  votes: many(votes),
}));

export const modelsRelations = relations(models, ({ many }) => ({
  ratingHistory: many(ratingHistory),
  voiceStats: many(voiceStats),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  user: one(users, { fields: [votes.userId], references: [users.id] }),
  chosen: one(models, {
    fields: [votes.chosenModelId],
    references: [models.id],
    relationName: "chosen",
  }),
  rejected: one(models, {
    fields: [votes.rejectedModelId],
    references: [models.id],
    relationName: "rejected",
  }),
}));

/* ── Inferred types ───────────────────────────────────────────────────── */
export type UserRow = typeof users.$inferSelect;
export type ModelRow = typeof models.$inferSelect;
export type VoteRow = typeof votes.$inferSelect;
export type VoiceStatRow = typeof voiceStats.$inferSelect;
export type SecurityEventRow = typeof securityEvents.$inferSelect;
export type ErrorEventRow = typeof errorEvents.$inferSelect;
export type GenerationEventRow = typeof generationEvents.$inferSelect;

export { sql };
