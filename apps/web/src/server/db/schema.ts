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
    /** Whether this vote affects public ratings. */
    countsForPublic: integer("counts_for_public", { mode: "boolean" })
      .notNull()
      .default(true),

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

export { sql };
