CREATE TABLE `vote_window_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`day_date` text NOT NULL,
	`window_start` text NOT NULL,
	`window_end` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vote_window_overrides_game_date_unique` ON `vote_window_overrides` (`game_id`,`day_date`);
