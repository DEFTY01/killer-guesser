import { db } from "@/db";
import { events, game_players, games } from "@/db/schema";
import { and, eq, gt, lte, sql } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { cleanupPoller } from "@/lib/pollers";

// ── Internal helpers ──────────────────────────────────────────────

/**
 * Publishes a `game_ended` Ably event to the `game-[gameId]` channel.
 * Requires the `ABLY_API_KEY` environment variable to be set.
 * Silently skips publishing when the key is absent (e.g. in unit tests).
 *
 * @param gameId    - The game's nanoid10 identifier.
 * @param winnerTeam - The winning team identifier ("team1" | "team2"), or `null` when
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
 * Archives past events and deletes future events for a game.
 * Runs non-transactionally after the critical game-status update has committed,
 * so it does not hold a write lock on the events table for the duration of the
 * game-close transaction.
 */
async function archiveAndCleanEvents(gameId: string): Promise<void> {
  // Archive past events.
  await db
    .update(events)
    .set({ is_archived: 1 })
    .where(
      and(
        eq(events.game_id, gameId),
        lte(events.created_at, sql<number>`(unixepoch())`),
      ),
    );

  // Delete future scheduled events.
  await db
    .delete(events)
    .where(
      and(
        eq(events.game_id, gameId),
        gt(events.created_at, sql<number>`(unixepoch())`),
      ),
    );
}

// ── Exported functions ────────────────────────────────────────────

/**
 * Checks if the game is over by evaluating team-based win conditions.
 *
 * Queries the game's `evil_team_is_team1` flag to determine which team
 * identifier is evil (team1) and which is good (team2), then counts alive
 * players on each side (`is_dead = 0`).
 *
 * Win conditions:
 * - **Evil wins**: zero alive players remain on the good team.
 * - **Good wins**: zero alive players remain on the evil team
 *   (all evil team members — including multi-killers — are dead).
 *
 * If a win condition is met, delegates to `handleEvilWins` or `handleGoodWins`.
 * If neither condition is met, returns without changing game state.
 *
 * @param gameId - The game's nanoid10 identifier.
 */
export async function checkGameOver(gameId: string): Promise<void> {
  // Load game metadata to determine team alignment.
  const [game] = await db
    .select({ evil_team_is_team1: games.evil_team_is_team1 })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) return;

  const evilTeamId: "team1" | "team2" = game.evil_team_is_team1 === 1 ? "team1" : "team2";
  const goodTeamId: "team1" | "team2" = game.evil_team_is_team1 === 1 ? "team2" : "team1";

  // Count alive players on each team (alive = is_dead=0).
  const allPlayers = await db
    .select({ team: game_players.team, is_dead: game_players.is_dead })
    .from(game_players)
    .where(eq(game_players.game_id, gameId))
    .limit(50);

  const aliveEvil = allPlayers.filter(
    (p) => p.team === evilTeamId && p.is_dead === 0,
  ).length;
  const aliveGood = allPlayers.filter(
    (p) => p.team === goodTeamId && p.is_dead === 0,
  ).length;

  if (aliveGood === 0 && allPlayers.some((p) => p.team === goodTeamId)) {
    // All good team players are dead → Evil wins.
    await handleEvilWins(gameId, evilTeamId);
  } else if (aliveEvil === 0 && allPlayers.some((p) => p.team === evilTeamId)) {
    // All evil team players are dead → Good wins.
    await handleGoodWins(gameId, goodTeamId);
  }
}

/**
 * Handles the Good team winning (all evil team members are dead).
 *
 * Within a single database transaction:
 *  1. Archives all past events for the game (`is_archived = 1`).
 *  2. Deletes any future scheduled events.
 *  3. Sets the game `status` to `"closed"`.
 *  4. Sets `winner_team` to the good team identifier (e.g. `"team2"`).
 *
 * After the transaction commits, publishes a `game_ended` event with
 * `{ winner_team: goodTeamId }` in the payload.
 *
 * @param gameId     - The game's nanoid10 identifier.
 * @param goodTeamId - The team identifier for the good team ("team1" | "team2").
 */
export async function handleGoodWins(
  gameId: string,
  goodTeamId: "team1" | "team2" = "team2",
): Promise<void> {
  // Atomically close the game — status update only, no archival in the tx.
  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({ status: "closed", winner_team: goodTeamId })
      .where(eq(games.id, gameId));
  });

  // Archive events non-transactionally so the write lock is not held
  // for the duration of the (slower) archival queries.
  await archiveAndCleanEvents(gameId);

  cleanupPoller(gameId);
  await publishGameEnded(gameId, goodTeamId);
}

/**
 * Handles the Evil team winning (all good team members are dead).
 *
 * Within a single database transaction:
 *  1. Archives all past events for the game (`is_archived = 1`).
 *  2. Deletes any future scheduled events.
 *  3. Sets the game `status` to `"closed"`.
 *  4. Sets `winner_team` to the evil team identifier (e.g. `"team1"`).
 *
 * After the transaction commits, publishes a `game_ended` event with
 * `{ winner_team: evilTeamId }` in the payload.
 *
 * @param gameId     - The game's nanoid10 identifier.
 * @param evilTeamId - The team identifier for the evil team ("team1" | "team2").
 */
export async function handleEvilWins(
  gameId: string,
  evilTeamId: "team1" | "team2" = "team1",
): Promise<void> {
  // Atomically close the game — status update only, no archival in the tx.
  await db.transaction(async (tx) => {
    await tx
      .update(games)
      .set({ status: "closed", winner_team: evilTeamId })
      .where(eq(games.id, gameId));
  });

  // Archive events non-transactionally so the write lock is not held
  // for the duration of the (slower) archival queries.
  await archiveAndCleanEvents(gameId);

  cleanupPoller(gameId);
  await publishGameEnded(gameId, evilTeamId);
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

  cleanupPoller(gameId);
  await publishGameEnded(gameId, null);
}
