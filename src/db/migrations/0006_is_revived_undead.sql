ALTER TABLE `game_players` ADD `is_revived` integer NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE `game_players` ADD `last_revive_at` integer;--> statement-breakpoint
ALTER TABLE `game_settings` ADD `revive_cooldown_minutes` integer;
