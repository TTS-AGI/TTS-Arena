/**
 * Database schema (Drizzle, Postgres).
 *
 * Models the TTS arena cleanly: users, models with live Glicko-2 ratings,
 * votes, a rating-history trail, per-voice stats, and single-use sentences.
 * The old security/anti-abuse tables are intentionally omitted.
 *
 * Glicko-2 lives on the model row (rating/deviation/volatility) for fast live
 * updates; the canonical leaderboard is a periodic Bradley–Terry fit computed
 * from `votes` (see server/rating).
 */
import { relations, sql } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

/* ── Users ────────────────────────────────────────────────────────────── */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: varchar("username", { length: 100 }).notNull().unique(),
  /** Hugging Face account id (stable across username changes). */
  hfId: varchar("hf_id", { length: 100 }).notNull().unique(),
  joinDate: timestamp("join_date", { withTimezone: true })
    .notNull()
    .defaultNow(),
  /** HF account creation date, used for the sign-in age gate. */
  hfAccountCreated: timestamp("hf_account_created", { withTimezone: true }),
  /** Email from the HF `email` OAuth scope (logged, not displayed). */
  email: varchar("email", { length: 255 }),
  /** Absolute HF avatar URL. */
  avatarUrl: varchar("avatar_url", { length: 500 }),
  showInLeaderboard: boolean("show_in_leaderboard").notNull().default(true),
});

/* ── Models ───────────────────────────────────────────────────────────── */
export const models = pgTable("models", {
  /** Arena slug, e.g. "eleven-multilingual-v2". Matches @ttsa/shared MODELS. */
  id: varchar("id", { length: 100 }).primaryKey(),
  name: varchar("name", { length: 150 }).notNull(),
  /** "tts" | "conversational". */
  modelType: varchar("model_type", { length: 20 }).notNull(),
  isOpen: boolean("is_open").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  url: varchar("url", { length: 255 }),
  /** Optional provider logo URL shown on the leaderboard. */
  icon: varchar("icon", { length: 255 }),

  // ── Live Glicko-2 state ──
  /** Display rating (Glicko-2, centered on 1500). */
  rating: doublePrecision("rating").notNull().default(1500),
  /** Rating deviation — uncertainty; high until enough games are played. */
  ratingDeviation: doublePrecision("rating_deviation").notNull().default(350),
  /** Volatility — expected fluctuation in performance. */
  volatility: doublePrecision("volatility").notNull().default(0.06),

  // ── Denormalized counters (cheap reads; derived from votes) ──
  winCount: integer("win_count").notNull().default(0),
  matchCount: integer("match_count").notNull().default(0),

  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ── Votes ────────────────────────────────────────────────────────────── */
export const votes = pgTable(
  "votes",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    text: text("text").notNull(),
    modelType: varchar("model_type", { length: 20 }).notNull(),

    chosenModelId: varchar("chosen_model_id", { length: 100 })
      .notNull()
      .references(() => models.id),
    rejectedModelId: varchar("rejected_model_id", { length: 100 })
      .notNull()
      .references(() => models.id),

    /** Provider-scoped voice ids actually used, for per-voice analytics. */
    chosenVoice: varchar("chosen_voice", { length: 120 }),
    rejectedVoice: varchar("rejected_voice", { length: 120 }),

    /**
     * Paths (in the /audio persistent bucket) to the PRE-normalization audio
     * for each side, retained for a future RLHF/preference dataset release.
     */
    chosenAudioPath: text("chosen_audio_path"),
    rejectedAudioPath: text("rejected_audio_path"),

    /** SHA-256 of the trimmed prompt; ties votes to the sentence pool. */
    sentenceHash: varchar("sentence_hash", { length: 64 }),
    /** "dataset" | "custom". Only dataset prompts feed the public board. */
    sentenceOrigin: varchar("sentence_origin", { length: 20 }).notNull(),
    /** Whether this vote affects public ratings. */
    countsForPublic: boolean("counts_for_public").notNull().default(true),

    /** Seconds between generation and vote (engagement signal). */
    sessionDurationSeconds: doublePrecision("session_duration_seconds"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
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
export const ratingHistory = pgTable(
  "rating_history",
  {
    id: serial("id").primaryKey(),
    modelId: varchar("model_id", { length: 100 })
      .notNull()
      .references(() => models.id),
    modelType: varchar("model_type", { length: 20 }).notNull(),
    rating: doublePrecision("rating").notNull(),
    ratingDeviation: doublePrecision("rating_deviation").notNull(),
    voteId: integer("vote_id").references(() => votes.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    byModel: index("rating_history_model_idx").on(t.modelId),
    byTime: index("rating_history_time_idx").on(t.createdAt),
  }),
);

/* ── Per-voice stats ──────────────────────────────────────────────────── */
/**
 * Aggregated performance of each (model, voice) pair. The voice pool differs
 * per model, so this is keyed on both. Not displayed yet — collected so we can
 * surface which voices perform best per model later.
 */
export const voiceStats = pgTable(
  "voice_stats",
  {
    id: serial("id").primaryKey(),
    modelId: varchar("model_id", { length: 100 })
      .notNull()
      .references(() => models.id),
    voice: varchar("voice", { length: 120 }).notNull(),
    winCount: integer("win_count").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    uniqModelVoice: uniqueIndex("voice_stats_model_voice_idx").on(
      t.modelId,
      t.voice,
    ),
  }),
);

/* ── Consumed sentences (single-use dataset prompts) ──────────────────── */
export const consumedSentences = pgTable("consumed_sentences", {
  id: serial("id").primaryKey(),
  sentenceHash: varchar("sentence_hash", { length: 64 }).notNull().unique(),
  sentenceText: text("sentence_text").notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/* ── Battle sessions ──────────────────────────────────────────────────── */
/**
 * A live blind battle, persisted so it survives server restarts and is shared
 * across requests/instances. Model identity lives here (server-side only) until
 * the user votes. Audio bytes are cached on disk (see arena/audio-cache); only
 * the file paths are stored here.
 */
export const battleSessions = pgTable(
  "battle_sessions",
  {
    /** Opaque session id (uuid) handed to the client. */
    id: varchar("id", { length: 64 }).primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    modelType: varchar("model_type", { length: 20 }).notNull(),
    text: text("text").notNull(),
    sentenceHash: varchar("sentence_hash", { length: 64 }).notNull(),

    aModelId: varchar("a_model_id", { length: 100 }).notNull(),
    aVoice: varchar("a_voice", { length: 120 }).notNull(),
    aPath: text("a_path").notNull(),
    aExt: varchar("a_ext", { length: 12 }).notNull(),
    /** Path (in the /audio log bucket) to side A's pre-normalization clip. */
    aLogPath: text("a_log_path"),

    bModelId: varchar("b_model_id", { length: 100 }).notNull(),
    bVoice: varchar("b_voice", { length: 120 }).notNull(),
    bPath: text("b_path").notNull(),
    bExt: varchar("b_ext", { length: 12 }).notNull(),
    /** Path (in the /audio log bucket) to side B's pre-normalization clip. */
    bLogPath: text("b_log_path"),

    voted: boolean("voted").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
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

// Re-exported so migration tooling and raw SQL helpers can reference it.
export { sql };
