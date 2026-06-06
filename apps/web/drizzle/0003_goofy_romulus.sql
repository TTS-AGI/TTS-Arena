CREATE TABLE `error_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`severity` text DEFAULT 'error' NOT NULL,
	`message` text NOT NULL,
	`stack` text,
	`route` text,
	`method` text,
	`provider` text,
	`model` text,
	`status` integer,
	`user_id` integer,
	`detail` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `error_events_time_idx` ON `error_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `error_events_source_idx` ON `error_events` (`source`);--> statement-breakpoint
CREATE INDEX `error_events_severity_idx` ON `error_events` (`severity`);--> statement-breakpoint
CREATE INDEX `error_events_model_idx` ON `error_events` (`model`);