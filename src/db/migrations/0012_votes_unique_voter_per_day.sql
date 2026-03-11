-- Prevent a single player from casting more than one vote per day in the same game.
-- This unique index enforces at the DB level what the application upsert relies on.
CREATE UNIQUE INDEX IF NOT EXISTS `votes_game_day_voter_unique`
  ON `votes` (`game_id`, `day`, `voter_id`);
