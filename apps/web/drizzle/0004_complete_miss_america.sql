CREATE TABLE `generation_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`router_model` text,
	`duration_ms` integer NOT NULL,
	`success` integer NOT NULL,
	`audio_bytes` integer DEFAULT 0 NOT NULL,
	`text_length` integer,
	`status` integer,
	`error` text,
	`user_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `generation_events_time_idx` ON `generation_events` (`created_at`);--> statement-breakpoint
CREATE INDEX `generation_events_model_idx` ON `generation_events` (`model`);--> statement-breakpoint
CREATE INDEX `generation_events_provider_idx` ON `generation_events` (`provider`);--> statement-breakpoint
CREATE INDEX `generation_events_success_idx` ON `generation_events` (`success`);