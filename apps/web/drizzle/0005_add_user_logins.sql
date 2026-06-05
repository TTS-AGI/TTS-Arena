CREATE TABLE "user_logins" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ip" varchar(64),
	"user_agent" varchar(500),
	"fingerprint" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_logins" ADD CONSTRAINT "user_logins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_logins_user_idx" ON "user_logins" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_logins_ip_idx" ON "user_logins" USING btree ("ip");--> statement-breakpoint
CREATE INDEX "user_logins_fingerprint_idx" ON "user_logins" USING btree ("fingerprint");