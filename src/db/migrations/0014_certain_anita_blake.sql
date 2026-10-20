CREATE INDEX `events_game_day_idx` ON `events` (`game_id`,`day`);--> statement-breakpoint
CREATE INDEX `game_players_game_user_idx` ON `game_players` (`game_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `games_status_start_time_idx` ON `games` (`status`,`start_time`);