CREATE TABLE "battle_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"model_type" text NOT NULL,
	"text" text NOT NULL,
	"sentence_hash" text NOT NULL,
	"sentence_origin" text DEFAULT 'custom' NOT NULL,
	"a_model_id" text NOT NULL,
	"a_voice" text NOT NULL,
	"a_path" text NOT NULL,
	"a_ext" text NOT NULL,
	"a_log_path" text,
	"b_model_id" text NOT NULL,
	"b_voice" text NOT NULL,
	"b_path" text NOT NULL,
	"b_ext" text NOT NULL,
	"b_log_path" text,
	"voted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cap_challenges" (
	"token" text PRIMARY KEY NOT NULL,
	"data" text NOT NULL,
	"expires" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cap_tokens" (
	"key" text PRIMARY KEY NOT NULL,
	"expires" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "consumed_sentences" (
	"id" serial PRIMARY KEY NOT NULL,
	"sentence_hash" text NOT NULL,
	"sentence_text" text NOT NULL,
	"consumed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "consumed_sentences_sentence_hash_unique" UNIQUE("sentence_hash")
);
--> statement-breakpoint
CREATE TABLE "error_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"source" text NOT NULL,
	"severity" text DEFAULT 'error' NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"route" text,
	"method" text,
	"provider" text,
	"model" text,
	"status" integer,
	"user_id" integer,
	"detail" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"router_model" text,
	"duration_ms" integer NOT NULL,
	"success" boolean NOT NULL,
	"audio_bytes" integer DEFAULT 0 NOT NULL,
	"text_length" integer,
	"status" integer,
	"error" text,
	"user_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"model_type" text NOT NULL,
	"provider" text,
	"is_open" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"timed_out_until" timestamp,
	"url" text,
	"icon" text,
	"rating" double precision DEFAULT 1500 NOT NULL,
	"rating_deviation" double precision DEFAULT 350 NOT NULL,
	"volatility" double precision DEFAULT 0.06 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"model_type" text NOT NULL,
	"rating" double precision NOT NULL,
	"rating_deviation" double precision NOT NULL,
	"vote_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"ip" text,
	"fingerprint" text,
	"kind" text NOT NULL,
	"severity" text DEFAULT 'info' NOT NULL,
	"detail" text,
	"vote_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"model" text NOT NULL,
	"model_name" text NOT NULL,
	"provider" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"duration_ms" integer,
	"audio_path" text,
	"extension" text,
	"error" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"sentence" text NOT NULL,
	"total" integer DEFAULT 0 NOT NULL,
	"completed" integer DEFAULT 0 NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"started_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"finished_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "user_logins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" text,
	"user_agent" text,
	"fingerprint" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"hf_id" text NOT NULL,
	"join_date" timestamp DEFAULT now() NOT NULL,
	"hf_account_created" timestamp,
	"email" text,
	"avatar_url" text,
	"show_in_leaderboard" boolean DEFAULT true NOT NULL,
	"trust_score" double precision DEFAULT 100 NOT NULL,
	"quarantined" boolean DEFAULT false NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_hf_id_unique" UNIQUE("hf_id")
);
--> statement-breakpoint
CREATE TABLE "voice_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" text NOT NULL,
	"voice" text NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"model_type" text NOT NULL,
	"chosen_model_id" text NOT NULL,
	"rejected_model_id" text NOT NULL,
	"chosen_voice" text,
	"rejected_voice" text,
	"chosen_audio_path" text,
	"rejected_audio_path" text,
	"sentence_hash" text,
	"sentence_origin" text NOT NULL,
	"counts_for_public" boolean DEFAULT true NOT NULL,
	"risk_score" double precision DEFAULT 0 NOT NULL,
	"risk_reasons" text,
	"flagged" boolean DEFAULT false NOT NULL,
	"session_duration_seconds" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "security_events" ADD CONSTRAINT "security_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_results" ADD CONSTRAINT "test_results_run_id_test_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."test_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_logins" ADD CONSTRAINT "user_logins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_stats" ADD CONSTRAINT "voice_stats_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chosen_model_id_models_id_fk" FOREIGN KEY ("chosen_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_rejected_model_id_models_id_fk" FOREIGN KEY ("rejected_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_sessions_expiry_idx" ON "battle_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "error_events_time_idx" ON "error_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "error_events_source_idx" ON "error_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "error_events_severity_idx" ON "error_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "error_events_model_idx" ON "error_events" USING btree ("model");--> statement-breakpoint
CREATE INDEX "generation_events_time_idx" ON "generation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "generation_events_model_idx" ON "generation_events" USING btree ("model");--> statement-breakpoint
CREATE INDEX "generation_events_provider_idx" ON "generation_events" USING btree ("provider");--> statement-breakpoint
CREATE INDEX "generation_events_success_idx" ON "generation_events" USING btree ("success");--> statement-breakpoint
CREATE INDEX "rating_history_model_idx" ON "rating_history" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "rating_history_time_idx" ON "rating_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_time_idx" ON "security_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "security_events_kind_idx" ON "security_events" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "security_events_severity_idx" ON "security_events" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "security_events_user_idx" ON "security_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "test_results_run_idx" ON "test_results" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "test_results_run_status_idx" ON "test_results" USING btree ("run_id","status");--> statement-breakpoint
CREATE INDEX "test_runs_time_idx" ON "test_runs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "test_runs_status_idx" ON "test_runs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_logins_user_idx" ON "user_logins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_logins_ip_idx" ON "user_logins" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "user_logins_fingerprint_idx" ON "user_logins" USING btree ("fingerprint");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_stats_model_voice_idx" ON "voice_stats" USING btree ("model_id","voice");--> statement-breakpoint
CREATE INDEX "votes_user_idx" ON "votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "votes_chosen_idx" ON "votes" USING btree ("chosen_model_id");--> statement-breakpoint
CREATE INDEX "votes_rejected_idx" ON "votes" USING btree ("rejected_model_id");--> statement-breakpoint
CREATE INDEX "votes_type_idx" ON "votes" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "votes_sentence_idx" ON "votes" USING btree ("sentence_hash");--> statement-breakpoint
CREATE INDEX "votes_user_time_idx" ON "votes" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "votes_flagged_idx" ON "votes" USING btree ("flagged");