CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`day` integer NOT NULL,
	`type` text NOT NULL,
	`payload` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`is_archived` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `game_players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`team` text,
	`role_id` integer,
	`is_dead` integer DEFAULT 0 NOT NULL,
	`died_at` integer,
	`died_location` text,
	`died_time_of_day` text,
	`revived_at` integer,
	`has_tipped` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_settings` (
	`game_id` text PRIMARY KEY NOT NULL,
	`special_role_count` integer,
	`role_chances` text,
	`bg_light_url` text,
	`bg_dark_url` text,
	`murder_item_url` text,
	`murder_item_name` text,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`start_time` integer NOT NULL,
	`vote_window_start` text,
	`vote_window_end` text,
	`team1_name` text DEFAULT 'Good' NOT NULL,
	`team2_name` text DEFAULT 'Evil' NOT NULL,
	`winner_team` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`team` text NOT NULL,
	`description` text,
	`chance_percent` real DEFAULT 10 NOT NULL,
	`permissions` text,
	`color_hex` text DEFAULT '#2E6DA4' NOT NULL,
	`is_default` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`avatar_url` text,
	`role` text DEFAULT 'member' NOT NULL,
	`is_active` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `votes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` text NOT NULL,
	`day` integer NOT NULL,
	`voter_id` integer NOT NULL,
	`target_id` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`voter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`target_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
