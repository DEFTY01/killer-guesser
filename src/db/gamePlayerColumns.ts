import { getTableColumns } from "drizzle-orm";
import { game_players } from "./schema";

/**
 * Every game_players column except PIN material. Use this instead of a bare
 * `.select()` whenever rows are sent to a browser.
 */
const { pin_hash, pin_failed_attempts, pin_locked_until, ...safe } =
  getTableColumns(game_players);
void pin_hash;
void pin_failed_attempts;
void pin_locked_until;

export const safeGamePlayerColumns = safe;
