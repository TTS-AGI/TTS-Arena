CREATE TABLE `cap_challenges` (
	`token` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cap_tokens` (
	`key` text PRIMARY KEY NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `security_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`ip` text,
	`fingerprint` text,
	`kind` text NOT NULL,
	`severity` text DEFAULT 'info' NOT NULL,
	`detail` text,
	`vote_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `security_events_time_idx` ON `security_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `security_events_kind_idx` ON `security_events` (`kind`);--> statement-breakpoint
CREATE INDEX `security_events_severity_idx` ON `security_events` (`severity`);--> statement-breakpoint
CREATE INDEX `security_events_user_idx` ON `security_events` (`user_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `trust_score` real DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `quarantined` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `votes` ADD `risk_score` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `votes` ADD `risk_reasons` text;--> statement-breakpoint
ALTER TABLE `votes` ADD `flagged` integer DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX `votes_user_time_idx` ON `votes` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `votes_flagged_idx` ON `votes` (`flagged`);