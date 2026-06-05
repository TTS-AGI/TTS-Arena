CREATE TABLE "consumed_sentences" (
	"id" serial PRIMARY KEY NOT NULL,
	"sentence_hash" varchar(64) NOT NULL,
	"sentence_text" text NOT NULL,
	"consumed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumed_sentences_sentence_hash_unique" UNIQUE("sentence_hash")
);
--> statement-breakpoint
CREATE TABLE "models" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"model_type" varchar(20) NOT NULL,
	"is_open" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"url" varchar(255),
	"rating" double precision DEFAULT 1500 NOT NULL,
	"rating_deviation" double precision DEFAULT 350 NOT NULL,
	"volatility" double precision DEFAULT 0.06 NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rating_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"model_type" varchar(20) NOT NULL,
	"rating" double precision NOT NULL,
	"rating_deviation" double precision NOT NULL,
	"vote_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(100) NOT NULL,
	"hf_id" varchar(100) NOT NULL,
	"join_date" timestamp with time zone DEFAULT now() NOT NULL,
	"hf_account_created" timestamp with time zone,
	"show_in_leaderboard" boolean DEFAULT true NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_hf_id_unique" UNIQUE("hf_id")
);
--> statement-breakpoint
CREATE TABLE "voice_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"model_id" varchar(100) NOT NULL,
	"voice" varchar(120) NOT NULL,
	"win_count" integer DEFAULT 0 NOT NULL,
	"match_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"text" text NOT NULL,
	"model_type" varchar(20) NOT NULL,
	"chosen_model_id" varchar(100) NOT NULL,
	"rejected_model_id" varchar(100) NOT NULL,
	"chosen_voice" varchar(120),
	"rejected_voice" varchar(120),
	"sentence_hash" varchar(64),
	"sentence_origin" varchar(20) NOT NULL,
	"counts_for_public" boolean DEFAULT true NOT NULL,
	"session_duration_seconds" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_history" ADD CONSTRAINT "rating_history_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_stats" ADD CONSTRAINT "voice_stats_model_id_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_chosen_model_id_models_id_fk" FOREIGN KEY ("chosen_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "votes" ADD CONSTRAINT "votes_rejected_model_id_models_id_fk" FOREIGN KEY ("rejected_model_id") REFERENCES "public"."models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rating_history_model_idx" ON "rating_history" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "rating_history_time_idx" ON "rating_history" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "voice_stats_model_voice_idx" ON "voice_stats" USING btree ("model_id","voice");--> statement-breakpoint
CREATE INDEX "votes_user_idx" ON "votes" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "votes_chosen_idx" ON "votes" USING btree ("chosen_model_id");--> statement-breakpoint
CREATE INDEX "votes_rejected_idx" ON "votes" USING btree ("rejected_model_id");--> statement-breakpoint
CREATE INDEX "votes_type_idx" ON "votes" USING btree ("model_type");--> statement-breakpoint
CREATE INDEX "votes_sentence_idx" ON "votes" USING btree ("sentence_hash");