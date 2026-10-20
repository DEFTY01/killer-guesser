ALTER TABLE `game_players` ADD `pin_hash` text;--> statement-breakpoint
ALTER TABLE `game_players` ADD `pin_failed_attempts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `game_players` ADD `pin_locked_until` integer;--> statement-breakpoint
ALTER TABLE `games` ADD `join_code` text;--> statement-breakpoint
CREATE UNIQUE INDEX `games_join_code_unique` ON `games` (`join_code`);