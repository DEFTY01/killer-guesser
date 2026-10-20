import { db } from "@/db";
import { vote_window_overrides } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import {
  addDays,
  localDate,
  resolveRoundState,
  type RoundState,
  type RoundWindow,
} from "@/lib/voteRound";

export interface VotingGame {
  id: string;
  start_time: number;
  timezone: string;
  vote_window_start: string | null;
  vote_window_end: string | null;
  /** Last round already tallied (or force-closed by an admin). */
  vote_closed_day: number;
}

/**
 * Loads the per-day overrides around `nowMs` and resolves the vote round
 * state. An override replaces the game's default window for its date.
 */
export async function getVotingState(
  game: VotingGame,
  nowMs: number = Date.now(),
): Promise<RoundState> {
  const today = localDate(nowMs, game.timezone);
  const dates = [addDays(today, -1), today, addDays(today, 1)];

  const overrides = await db
    .select({
      day_date: vote_window_overrides.day_date,
      window_start: vote_window_overrides.window_start,
      window_end: vote_window_overrides.window_end,
    })
    .from(vote_window_overrides)
    .where(
      and(
        eq(vote_window_overrides.game_id, game.id),
        inArray(vote_window_overrides.day_date, dates),
      ),
    );

  const byDate = new Map<string, RoundWindow>(
    overrides.map((o) => [o.day_date, { start: o.window_start, end: o.window_end }]),
  );
  const fallback: RoundWindow | null =
    game.vote_window_start && game.vote_window_end
      ? { start: game.vote_window_start, end: game.vote_window_end }
      : null;

  const state = resolveRoundState({
    nowMs,
    startTimeUnix: game.start_time,
    timeZone: game.timezone,
    windowFor: (date) => byDate.get(date) ?? fallback,
  });

  // A round closed early by an admin counts as finished even though its window
  // has not run out yet.
  if (state.open && state.open.number <= game.vote_closed_day) {
    return { ...state, open: null, last: state.open };
  }
  return state;
}
