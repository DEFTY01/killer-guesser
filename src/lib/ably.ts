import Ably from "ably";

/**
 * Server-side Ably REST client.
 * Initialised from the `ABLY_API_KEY` environment variable.
 * Only available in server-side code (API routes, server actions, etc.).
 */
export const ablyServer = new Ably.Rest({
  key: process.env.ABLY_API_KEY ?? "",
});

/**
 * Channel-name helpers.
 * Use these everywhere instead of constructing raw channel strings.
 */
export const ABLY_CHANNELS = {
  /** Returns the channel name for a specific game, e.g. `"game-abc123"`. */
  game: (gameId: string) => `game-${gameId}`,

  /** Returns the channel name for a specific day's vote, e.g. `"vote-abc123-1"`. */
  vote: (gameId: string, day: number) => `vote-${gameId}-${day}`,
} as const;

/**
 * Event-name constants.
 * All Ably event names must be referenced through this object — no raw
 * event-name strings are permitted elsewhere in the application.
 */
export const ABLY_EVENTS = {
  player_died: "player_died",
  vote_cast: "vote_cast",
  vote_closed: "vote_closed",
  game_ended: "game_ended",
  player_revived: "player_revived",
} as const;

/** Union type of all valid Ably event names. */
export type AblyEvent = (typeof ABLY_EVENTS)[keyof typeof ABLY_EVENTS];
