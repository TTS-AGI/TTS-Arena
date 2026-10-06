CREATE TABLE "signal_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"session_id" text,
	"set_id" text,
	"ip" text,
	"user_agent" text,
	"fingerprint" text,
	"components" jsonb,
	"headers" jsonb,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "signal_reports" ADD CONSTRAINT "signal_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "signal_reports_user_idx" ON "signal_reports" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "signal_reports_time_idx" ON "signal_reports" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "signal_reports_fingerprint_idx" ON "signal_reports" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "signal_reports_ip_idx" ON "signal_reports" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "signal_reports_session_idx" ON "signal_reports" USING btree ("session_id");