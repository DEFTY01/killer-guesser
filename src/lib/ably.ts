import Ably from "ably";

/**
 * Server-side Ably REST client.
 * Lazily instantiated — the `Ably.Rest` constructor throws when the key is
 * absent, so we only create the instance when `ABLY_API_KEY` is present.
 *
 * All callers must guard with `if (process.env.ABLY_API_KEY)` before
 * accessing this value, which is the existing convention throughout the
 * codebase.  The `null as unknown as Ably.Rest` cast keeps callers' types
 * consistent without requiring a null-check after the env guard.
 */
let _ablyServer: Ably.Rest | undefined;

export const ablyServer: Ably.Rest = new Proxy({} as Ably.Rest, {
  get(_target, prop) {
    if (!_ablyServer) {
      const key = process.env.ABLY_API_KEY;
      if (!key) {
        throw new Error(
          "ablyServer accessed without ABLY_API_KEY being set. " +
            "Always guard with `if (process.env.ABLY_API_KEY)` before using ablyServer.",
        );
      }
      _ablyServer = new Ably.Rest({ key });
    }
    return (_ablyServer as unknown as Record<string | symbol, unknown>)[prop];
  },
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
