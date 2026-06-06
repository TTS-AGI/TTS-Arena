CREATE TABLE `test_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`model` text NOT NULL,
	`model_name` text NOT NULL,
	`provider` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`duration_ms` integer,
	`audio_path` text,
	`extension` text,
	`error` text,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `test_runs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `test_results_run_idx` ON `test_results` (`run_id`);--> statement-breakpoint
CREATE INDEX `test_results_run_status_idx` ON `test_results` (`run_id`,`status`);--> statement-breakpoint
CREATE TABLE `test_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`status` text DEFAULT 'running' NOT NULL,
	`sentence` text NOT NULL,
	`total` integer DEFAULT 0 NOT NULL,
	`completed` integer DEFAULT 0 NOT NULL,
	`passed` integer DEFAULT 0 NOT NULL,
	`failed` integer DEFAULT 0 NOT NULL,
	`started_by` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`finished_at` integer
);
--> statement-breakpoint
CREATE INDEX `test_runs_time_idx` ON `test_runs` (`created_at`);--> statement-breakpoint
CREATE INDEX `test_runs_status_idx` ON `test_runs` (`status`);--> statement-breakpoint
ALTER TABLE `models` ADD `provider` text;--> statement-breakpoint
ALTER TABLE `models` ADD `timed_out_until` integer;