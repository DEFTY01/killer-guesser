import { db } from "@/db";
import { events, game_players, games, roles } from "@/db/schema";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

/** Type of the transaction object passed by Drizzle to `db.transaction()`. */
type DbTx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Publishes a `game_ended` Ably event to the `game-[gameId]` channel.
 * Requires the `ABLY_API_KEY` environment variable to be set.
 * Silently skips publishing when the key is absent (e.g. in unit tests).
 *
 * @param gameId    - The game's nanoid10 identifier.
 * @param winnerTeam - The display name of the winning team, or `null` when
 *                    there is no winner (e.g. admin close / delete).
 */
async function publishGameEnded(
  gameId: string,
  winnerTeam: string | null,
): Promise<void> {
  const apiKey = process.env.ABLY_API_KEY;
  if (!apiKey) return;

  const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
  await channel.publish(ABLY_EVENTS.game_ended, { winner_team: winnerTeam });
}

/**
 * Resolves the winning team's display name for a given game.
 *
 * Looks up the `game_players` row whose assigned role is named `"Killer"`
 * to determine which team the killer belongs to, then returns the
 * appropriate `team1_name` or `team2_name` from the `games` row.
 *
 * Falls back to treating the killer as `team1` when no Killer-role player
 * is found.
 *
 * @param tx          - Active Drizzle transaction (or the global `db`).
 * @param gameId      - The game's nanoid10 identifier.
 * @param killerWins  - `true` → return the killer's team name;
 *                      `false` → return the survivors' team name.
 * @returns The display name of the winning team, or `null` if the game
 *          record is not found.
 */
async function resolveWinnerTeam(
  tx: DbTx,
  gameId: string,
  killerWins: boolean,
): Promise<string | null> {
  const [game] = await tx
    .select({ team1_name: games.team1_name, team2_name: games.team2_name })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) return null;

  // Find the team of the player assigned the "Killer" role in this game.
  const [killerPlayer] = await tx
    .select({ team: game_players.team })
    .from(game_players)
    .innerJoin(roles, eq(game_players.role_id, roles.id))
    .where(and(eq(game_players.game_id, gameId), eq(roles.name, "Killer")))
    .limit(1);

  // Default to team1 when no Killer-role player is found.
  const killerTeam = killerPlayer?.team ?? "team1";

  if (killerWins) {
    return killerTeam === "team1" ? game.team1_name : game.team2_name;
  }

  // Survivors win — the other team.
  return killerTeam === "team1" ? game.team2_name : game.team1_name;
}

// ── Exported functions ────────────────────────────────────────────

/**
 * Handles the scenario where the killer is voted out or correctly
 * identified by a player's tip.
 *
 * Within a single database transaction:
 *  1. Archives all past events for the game (`is_archived = 1`)
 *     where `created_at <= unixepoch()`.
 *  2. Deletes any future scheduled events (`created_at > unixepoch()`).
 *  3. Sets the game `status` to `"closed"`.
 *  4. Sets `winner_team` to the survivors' team display name.
 *
 * After the transaction commits, publishes a `game_ended` event to the
 * `game-[gameId]` Ably channel with `{ winner_team }` in the payload.
 *
 * @param gameId - The game's nanoid10 identifier.
 */
export async function handleKillerDefeated(gameId: string): Promise<void> {
  const winnerTeam = await db.transaction(async (tx) => {
    const winner = await resolveWinnerTeam(tx, gameId, false);

    // Archive past events.
    await tx
      .update(events)
      .set({ is_archived: 1 })
      .where(
        and(
          eq(events.game_id, gameId),
          lte(events.created_at, sql<number>`(unixepoch())`),
        ),
      );

    // Delete future scheduled events.
    await tx
      .delete(events)
      .where(
        and(
          eq(events.game_id, gameId),
          gt(events.created_at, sql<number>`(unixepoch())`),
        ),
      );

    // Close the game and record the winner.
    await tx
      .update(games)
      .set({ status: "closed", winner_team: winner })
      .where(eq(games.id, gameId));

    return winner;
  });

  await publishGameEnded(gameId, winnerTeam);
}

/**
 * Handles the scenario where the killer has eliminated all opposing
 * players and wins the game.
 *
 * Within a single database transaction:
 *  1. Archives all past events for the game (`is_archived = 1`)
 *     where `created_at <= unixepoch()`.
 *  2. Deletes any future scheduled events (`created_at > unixepoch()`).
 *  3. Sets the game `status` to `"closed"`.
 *  4. Sets `winner_team` to the killer's team display name.
 *
 * After the transaction commits, publishes a `game_ended` event to the
 * `game-[gameId]` Ably channel with `{ winner_team }` in the payload.
 *
 * @param gameId - The game's nanoid10 identifier.
 */
export async function handleKillerWins(gameId: string): Promise<void> {
  const winnerTeam = await db.transaction(async (tx) => {
    const winner = await resolveWinnerTeam(tx, gameId, true);

    // Archive past events.
    await tx
      .update(events)
      .set({ is_archived: 1 })
      .where(
        and(
          eq(events.game_id, gameId),
          lte(events.created_at, sql<number>`(unixepoch())`),
        ),
      );

    // Delete future scheduled events.
    await tx
      .delete(events)
      .where(
        and(
          eq(events.game_id, gameId),
          gt(events.created_at, sql<number>`(unixepoch())`),
        ),
      );

    // Close the game and record the winner.
    await tx
      .update(games)
      .set({ status: "closed", winner_team: winner })
      .where(eq(games.id, gameId));

    return winner;
  });

  await publishGameEnded(gameId, winnerTeam);
}

/**
 * Hard-deletes all data related to a game.
 * Called by the admin "delete" action.
 *
 * Within a single database transaction:
 *  - Deletes the game record from `games`. Related rows in `game_players`,
 *    `votes`, `events`, and `game_settings` are removed automatically by
 *    the existing `ON DELETE CASCADE` foreign-key constraints.
 *
 * After the transaction commits, publishes a `game_ended` event to the
 * `game-[gameId]` Ably channel with `{ winner_team: null }` in the payload.
 *
 * @param gameId - The game's nanoid10 identifier.
 */
export async function deleteGame(gameId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(games).where(eq(games.id, gameId));
  });

  await publishGameEnded(gameId, null);
}

/**
 * Closes a game without deleting or archiving any data.
 * Called by the admin "end game" action.
 *
 * Within a single database transaction:
 *  - Sets the game `status` to `"closed"`.
 *  - All game data (players, events, votes, settings) remains intact
 *    and fully queryable.
 *
 * After the transaction commits, publishes a `game_ended` event to the
 * `game-[gameId]` Ably channel with `{ winner_team: null }` in the payload.
 *
 * @param gameId - The game's nanoid10 identifier.
 */
export async function closeGame(gameId: string): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({ status: "closed" })
      .where(eq(games.id, gameId));
  });

  await publishGameEnded(gameId, null);
}
