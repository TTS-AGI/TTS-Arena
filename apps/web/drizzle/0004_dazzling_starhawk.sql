ALTER TABLE "votes" ADD COLUMN "ip" text;--> statement-breakpoint
ALTER TABLE "votes" ADD COLUMN "fingerprint" text;--> statement-breakpoint
CREATE INDEX "votes_ip_time_idx" ON "votes" USING btree ("ip","created_at");--> statement-breakpoint
CREATE INDEX "votes_fingerprint_time_idx" ON "votes" USING btree ("fingerprint","created_at");