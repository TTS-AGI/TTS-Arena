ALTER TABLE "battle_sessions" ADD COLUMN "a_log_path" text;--> statement-breakpoint
ALTER TABLE "battle_sessions" ADD COLUMN "b_log_path" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "chosen_audio_path" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "rejected_audio_path" text;