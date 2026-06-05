CREATE TABLE "battle_sessions" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"model_type" varchar(20) NOT NULL,
	"text" text NOT NULL,
	"sentence_hash" varchar(64) NOT NULL,
	"a_model_id" varchar(100) NOT NULL,
	"a_voice" varchar(120) NOT NULL,
	"a_path" text NOT NULL,
	"a_ext" varchar(12) NOT NULL,
	"b_model_id" varchar(100) NOT NULL,
	"b_voice" varchar(120) NOT NULL,
	"b_path" text NOT NULL,
	"b_ext" varchar(12) NOT NULL,
	"voted" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "battle_sessions" ADD CONSTRAINT "battle_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "battle_sessions_expiry_idx" ON "battle_sessions" USING btree ("expires_at");