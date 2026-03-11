-- Add death_reason column to game_players to track why a player died.
-- e.g. "accused:userId" when a player died from a wrong tip accusation.
ALTER TABLE `game_players` ADD `death_reason` text;
