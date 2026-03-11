/**
 * Vote window helpers — shared between the player-facing vote API
 * and internal logic that needs to know whether voting is open.
 */

import { db } from "@/db";
import { games, vote_window_overrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { nowInZone } from "@/lib/timezone";

// ── Types ─────────────────────────────────────────────────────────

export interface VoteWindow {
  start: string;
  end: string;
}

// ── resolveVoteWindow ─────────────────────────────────────────────

/**
 * Resolves the effective vote window for a given game on a specific date.
 *
 * Priority:
 * 1. A per-day override in `vote_window_overrides` for (game_id, day_date).
 * 2. The game-level default (`vote_window_start` / `vote_window_end`).
 * 3. `null` — no window configured.
 *
 * @param gameId - The game ID.
 * @param date   - Calendar date in "YYYY-MM-DD" format (UTC).
 * @returns `{ start, end }` in "HH:MM" format, or `null`.
 */
export async function resolveVoteWindow(
  gameId: string,
  date: string,
): Promise<VoteWindow | null> {
  // 1. Check for a per-day override.
  const [override] = await db
    .select({
      window_start: vote_window_overrides.window_start,
      window_end: vote_window_overrides.window_end,
    })
    .from(vote_window_overrides)
    .where(
      and(
        eq(vote_window_overrides.game_id, gameId),
        eq(vote_window_overrides.day_date, date),
      ),
    )
    .limit(1);

  if (override) {
    return { start: override.window_start, end: override.window_end };
  }

  // 2. Fall back to the game-level default.
  const [game] = await db
    .select({
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (game?.vote_window_start && game?.vote_window_end) {
    return { start: game.vote_window_start, end: game.vote_window_end };
  }

  // 3. No window configured.
  return null;
}

// ── isVoteWindowOpen ──────────────────────────────────────────────

/**
 * Returns true if the given vote window is currently open in the
 * specified game timezone.
 *
 * @param window   - `{ start, end }` in "HH:MM" format, or `null`.
 * @param timezone - IANA timezone identifier (e.g. "Europe/Budapest").
 */
export function isVoteWindowOpen(
  window: VoteWindow | null,
  timezone: string,
): boolean {
  if (!window) return false;
  const { start, end } = window;
  const currentMin = nowInZone(timezone);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Handle overnight windows (e.g. 22:00–02:00).
  if (endMin <= startMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
}
