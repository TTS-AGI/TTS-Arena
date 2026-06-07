/**
 * Database schema (Drizzle, Postgres).
 *
 * Models the TTS arena: users, models with live Glicko-2 ratings, votes, a
 * rating-history trail, per-voice stats, single-use sentences, battle sessions,
 * and the anti-fraud / observability tables.
 *
 * Postgres (on a VPS, reached over a Cloudflare tunnel) replaced SQLite — a
 * single SQLite file on HF's network bucket kept corrupting. Booleans are real
 * booleans; timestamps are `timestamp` columns defaulting to now().
 */
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/* ── Users ────────────────────────────────────────────────────────────── */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  /** Hugging Face account id (stable across username changes). */
  hfId: text("hf_id").notNull().unique(),
  joinDate: timestamp("join_date").notNull().defaultNow(),
  /** HF account creation date, used for the sign-in age gate. */
  hfAccountCreated: timestamp("hf_account_created"),
  /** Email from the HF `email` OAuth scope (logged, not displayed). */
  email: text("email"),
  /** Absolute HF avatar URL. */
  avatarUrl: text("avatar_url"),
  showInLeaderboard: boolean("show_in_leaderboard").notNull().default(true),

  // ── Anti-fraud ──
  /** Trust score 0–100 (100 = fully trusted); lowered by the security sweep. */
  trustScore: doublePrecision("trust_score").notNull().default(100),
  /** When true, none of the user's votes count toward public ratings. */
  quarantined: boolean("quarantined").notNull().default(false),
});

/* ── User logins (full history for abuse investigation) ───────────────── */
export const userLogins = pgTable(
  "user_logins",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    /** Full client IP (resolved from forwarding headers). */
    ip: text("ip"),
    userAgent: text("user_agent"),
    /** FingerprintJS visitor id supplied by the client. */
    fingerprint: text("fingerprint"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byUser: index("user_logins_user_idx").on(t.userId),
    byIp: index("user_logins_ip_idx").on(t.ip),
    byFingerprint: index("user_logins_fingerprint_idx").on(t.fingerprint),
  }),
);

/* ── Models ───────────────────────────────────────────────────────────── */
export const models = pgTable("models", {
  /** Arena slug, e.g. "eleven-multilingual-v2". Matches @ttsa/shared MODELS. */
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  /** "tts" | "conversational". */
  modelType: text("model_type").notNull(),
  /** Provider id (from the router catalog), for grouping/filtering in admin. */
  provider: text("provider"),
  isOpen: boolean("is_open").notNull().default(false),
  isActive: boolean("is_active").notNull().default(true),
  /**
   * Temporary time-out: if set and in the future, the model is suppressed from
   * battles until then (e.g. an admin times out a failing model for a few
   * hours). Distinct from isActive, which is a manual on/off the admin controls.
   */
  timedOutUntil: timestamp("timed_out_until"),
  url: text("url"),
  /** Optional provider logo URL shown on the leaderboard. */
  icon: text("icon"),

  // ── Live Glicko-2 state ──
  // Defaults mirror @ttsa/shared DEFAULT_RATING/RD/VOL — a fresh model starts
  // here and its RD contracts as votes arrive.
  /** Display rating (Glicko-2, centered on 1500). */
  rating: doublePrecision("rating").notNull().default(1500),
  /** Rating deviation — uncertainty; high until enough games are played. */
  ratingDeviation: doublePrecision("rating_deviation").notNull().default(200),
  /** Volatility — expected fluctuation in performance. */
  volatility: doublePrecision("volatility").notNull().default(0.015),

  // ── Denormalized counters (cheap reads; derived from votes) ──
  winCount: integer("win_count").notNull().default(0),
  matchCount: integer("match_count").notNull().default(0),

  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
    countsForPublic: boolean("counts_for_public").notNull().default(true),

    // ── Anti-fraud audit trail ──
    /** Risk score assigned at vote time (0 = clean; higher = more suspicious). */
    riskScore: doublePrecision("risk_score").notNull().default(0),
    /** JSON array of reason codes that contributed to the risk score. */
    riskReasons: text("risk_reasons"),
    /** True if flagged as suspicious (inline or by the sweep). */
    flagged: boolean("flagged").notNull().default(false),

    /** Seconds between generation and vote (engagement signal). */
    sessionDurationSeconds: doublePrecision("session_duration_seconds"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
export const ratingHistory = pgTable(
  "rating_history",
  {
    id: serial("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    modelType: text("model_type").notNull(),
    rating: doublePrecision("rating").notNull(),
    ratingDeviation: doublePrecision("rating_deviation").notNull(),
    voteId: integer("vote_id").references(() => votes.id),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byModel: index("rating_history_model_idx").on(t.modelId),
    byTime: index("rating_history_time_idx").on(t.createdAt),
  }),
);

/* ── Per-voice stats ──────────────────────────────────────────────────── */
export const voiceStats = pgTable(
  "voice_stats",
  {
    id: serial("id").primaryKey(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id),
    voice: text("voice").notNull(),
    winCount: integer("win_count").notNull().default(0),
    matchCount: integer("match_count").notNull().default(0),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  sentenceHash: text("sentence_hash").notNull().unique(),
  sentenceText: text("sentence_text").notNull(),
  consumedAt: timestamp("consumed_at").notNull().defaultNow(),
});

/* ── Battle sessions ──────────────────────────────────────────────────── */
export const battleSessions = pgTable(
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

    voted: boolean("voted").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => ({
    byExpiry: index("battle_sessions_expiry_idx").on(t.expiresAt),
  }),
);

/* ── Security events (anti-fraud audit feed) ──────────────────────────── */
export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byTime: index("security_events_time_idx").on(t.createdAt),
    byKind: index("security_events_kind_idx").on(t.kind),
    bySeverity: index("security_events_severity_idx").on(t.severity),
    byUser: index("security_events_user_idx").on(t.userId),
  }),
);

/* ── Error events (observability — every caught error, persisted) ─────── */
export const errorEvents = pgTable(
  "error_events",
  {
    id: serial("id").primaryKey(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
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
export const generationEvents = pgTable(
  "generation_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    /** Stable arena model id (FK-shaped, not enforced — models may be reseeded). */
    model: text("model").notNull(),
    /** The provider-side router model actually invoked. */
    routerModel: text("router_model"),
    /** Wall-clock synthesis time in milliseconds. */
    durationMs: integer("duration_ms").notNull(),
    /** Did the synth succeed? */
    success: boolean("success").notNull(),
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
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    byTime: index("generation_events_time_idx").on(t.createdAt),
    byModel: index("generation_events_model_idx").on(t.model),
    byProvider: index("generation_events_provider_idx").on(t.provider),
    bySuccess: index("generation_events_success_idx").on(t.success),
  }),
);

/* ── Test runs ("Test All": synth every model, record pass/fail) ───────── */
/**
 * A "Test All" run, kicked off by an admin. Runs server-side in the background:
 * one fixed sentence is synthesized per model, each result stored in
 * test_results. The run row tracks overall progress so the admin can leave and
 * come back, watch live, and browse history. State machine: running → done
 * (or interrupted if the process restarts mid-run; the runner resumes pending).
 */
export const testRuns = pgTable(
  "test_runs",
  {
    id: serial("id").primaryKey(),
    /** "running" | "done" | "interrupted". */
    status: text("status").notNull().default("running"),
    /** The sentence synthesized for every model in this run. */
    sentence: text("sentence").notNull(),
    total: integer("total").notNull().default(0),
    completed: integer("completed").notNull().default(0),
    passed: integer("passed").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    /** Admin who started it (username), informational. */
    startedBy: text("started_by"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    finishedAt: timestamp("finished_at"),
  },
  (t) => ({
    byTime: index("test_runs_time_idx").on(t.createdAt),
    byStatus: index("test_runs_status_idx").on(t.status),
  }),
);

/** One per (run, model): a pending job that the runner fills in as it goes. */
export const testResults = pgTable(
  "test_results",
  {
    id: serial("id").primaryKey(),
    runId: integer("run_id")
      .notNull()
      .references(() => testRuns.id, { onDelete: "cascade" }),
    model: text("model").notNull(),
    modelName: text("model_name").notNull(),
    provider: text("provider"),
    /** "pending" | "running" | "pass" | "fail". */
    status: text("status").notNull().default("pending"),
    durationMs: integer("duration_ms"),
    /** Relative path under the run's audio dir, when a sample was produced. */
    audioPath: text("audio_path"),
    extension: text("extension"),
    error: text("error"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => ({
    byRun: index("test_results_run_idx").on(t.runId),
    byRunStatus: index("test_results_run_status_idx").on(t.runId, t.status),
  }),
);

/* ── Cap.js captcha storage (proof-of-work; no Redis needed) ──────────── */
export const capChallenges = pgTable("cap_challenges", {
  token: text("token").primaryKey(),
  data: text("data").notNull(),
  /** Expiry as unix-epoch milliseconds (Cap uses ms timestamps) — bigint. */
  expires: bigint("expires", { mode: "number" }).notNull(),
});

export const capTokens = pgTable("cap_tokens", {
  key: text("key").primaryKey(),
  expires: bigint("expires", { mode: "number" }).notNull(),
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
export type TestRunRow = typeof testRuns.$inferSelect;
export type TestResultRow = typeof testResults.$inferSelect;
