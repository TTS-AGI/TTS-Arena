CREATE TABLE `battle_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`model_type` text NOT NULL,
	`text` text NOT NULL,
	`sentence_hash` text NOT NULL,
	`a_model_id` text NOT NULL,
	`a_voice` text NOT NULL,
	`a_path` text NOT NULL,
	`a_ext` text NOT NULL,
	`a_log_path` text,
	`b_model_id` text NOT NULL,
	`b_voice` text NOT NULL,
	`b_path` text NOT NULL,
	`b_ext` text NOT NULL,
	`b_log_path` text,
	`voted` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `battle_sessions_expiry_idx` ON `battle_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `consumed_sentences` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sentence_hash` text NOT NULL,
	`sentence_text` text NOT NULL,
	`consumed_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `consumed_sentences_sentence_hash_unique` ON `consumed_sentences` (`sentence_hash`);--> statement-breakpoint
CREATE TABLE `models` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`model_type` text NOT NULL,
	`is_open` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`url` text,
	`icon` text,
	`rating` real DEFAULT 1500 NOT NULL,
	`rating_deviation` real DEFAULT 350 NOT NULL,
	`volatility` real DEFAULT 0.06 NOT NULL,
	`win_count` integer DEFAULT 0 NOT NULL,
	`match_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rating_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_id` text NOT NULL,
	`model_type` text NOT NULL,
	`rating` real NOT NULL,
	`rating_deviation` real NOT NULL,
	`vote_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`vote_id`) REFERENCES `votes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `rating_history_model_idx` ON `rating_history` (`model_id`);--> statement-breakpoint
CREATE INDEX `rating_history_time_idx` ON `rating_history` (`created_at`);--> statement-breakpoint
CREATE TABLE `user_logins` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`ip` text,
	`user_agent` text,
	`fingerprint` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_logins_user_idx` ON `user_logins` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_logins_ip_idx` ON `user_logins` (`ip`);--> statement-breakpoint
CREATE INDEX `user_logins_fingerprint_idx` ON `user_logins` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`hf_id` text NOT NULL,
	`join_date` integer DEFAULT (unixepoch()) NOT NULL,
	`hf_account_created` integer,
	`email` text,
	`avatar_url` text,
	`show_in_leaderboard` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);--> statement-breakpoint
CREATE UNIQUE INDEX `users_hf_id_unique` ON `users` (`hf_id`);--> statement-breakpoint
CREATE TABLE `voice_stats` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`model_id` text NOT NULL,
	`voice` text NOT NULL,
	`win_count` integer DEFAULT 0 NOT NULL,
	`match_count` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `voice_stats_model_voice_idx` ON `voice_stats` (`model_id`,`voice`);--> statement-breakpoint
CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`text` text NOT NULL,
	`model_type` text NOT NULL,
	`chosen_model_id` text NOT NULL,
	`rejected_model_id` text NOT NULL,
	`chosen_voice` text,
	`rejected_voice` text,
	`chosen_audio_path` text,
	`rejected_audio_path` text,
	`sentence_hash` text,
	`sentence_origin` text NOT NULL,
	`counts_for_public` integer DEFAULT true NOT NULL,
	`session_duration_seconds` real,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`chosen_model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`rejected_model_id`) REFERENCES `models`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `votes_user_idx` ON `votes` (`user_id`);--> statement-breakpoint
CREATE INDEX `votes_chosen_idx` ON `votes` (`chosen_model_id`);--> statement-breakpoint
CREATE INDEX `votes_rejected_idx` ON `votes` (`rejected_model_id`);--> statement-breakpoint
CREATE INDEX `votes_type_idx` ON `votes` (`model_type`);--> statement-breakpoint
CREATE INDEX `votes_sentence_idx` ON `votes` (`sentence_hash`);