ALTER TABLE "models" ADD COLUMN "suspended_at" timestamp;--> statement-breakpoint
ALTER TABLE "models" ADD COLUMN "suspended_reason" text;