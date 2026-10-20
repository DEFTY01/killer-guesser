import { db } from "@/db";
import { game_players, games, roles, users, votes } from "@/db/schema";
import { and, count, eq, lt, sql } from "drizzle-orm";
import { parsePermissions } from "@/lib/permissions";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { checkGameOver } from "@/lib/gameEnd";

type Executor = Pick<typeof db, "select" | "update">;

/** Vote counts per target for one round, with target names. */
export async function loadResults(gameId: string, day: number, executor: Executor = db) {
  const tally = await executor
    .select({
      target_id: votes.target_id,
      target_name: users.name,
      vote_count: count(votes.id),
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
    .groupBy(votes.target_id, users.name)
    .limit(200);
  return tally.map((r) => ({
    playerId: r.target_id,
    name: r.target_name,
    voteCount: r.vote_count,
  }));
}

/**
 * Tallies a round exactly once and eliminates the player with a strict
 * majority of the living voters.
 *
 * The claim (`vote_closed_day`), the kill and the recorded result happen in ONE
 * transaction: a crash or a failed publish can never leave a round marked
 * closed without its elimination. Realtime events go out after the commit and
 * never fail the request.
 *
 * Returns `undefined` when another request already closed this round.
 */
export async function closeRound(
  gameId: string,
  round: { number: number },
  options: { announce?: boolean } = {},
): Promise<{ eliminated: { id: number; name: string } | null } | undefined> {
  const { announce = true } = options;

  const outcome = await db.transaction(async (tx) => {
    const results = await loadResults(gameId, round.number, tx);
    const voterRows = await tx
      .select({ is_dead: game_players.is_dead, permissions: roles.permissions })
      .from(game_players)
      .leftJoin(roles, eq(game_players.role_id, roles.id))
      .where(eq(game_players.game_id, gameId))
      .limit(50);

    const [claimed] = await tx
      .update(games)
      .set({ vote_closed_day: round.number })
      .where(and(eq(games.id, gameId), lt(games.vote_closed_day, round.number)))
      .returning({ id: games.id });
    if (!claimed) return undefined;

    // Observers who know the killer cannot vote, so they do not count toward
    // the majority either.
    const eligibleVoters = voterRows.filter(
      (p) => p.is_dead === 0 && !parsePermissions(p.permissions).includes("see_killer"),
    ).length;

    const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);
    const top = sorted[0];
    const isStrictlyTop =
      top !== undefined && (sorted.length < 2 || sorted[1].voteCount < top.voteCount);
    const hasMajority = top !== undefined && top.voteCount * 2 > eligibleVoters;
    const winner = isStrictlyTop && hasMajority ? top : undefined;

    let eliminated: { id: number; name: string } | null = null;
    if (winner) {
      await tx
        .update(game_players)
        .set({
          is_dead: 1,
          died_at: sql<number>`(unixepoch())`,
          died_time_of_day: "evening",
        })
        .where(
          and(
            eq(game_players.game_id, gameId),
            eq(game_players.user_id, winner.playerId),
            eq(game_players.is_dead, 0),
          ),
        );
      await tx
        .update(games)
        .set({ vote_eliminated_user_id: winner.playerId, vote_eliminated_day: round.number })
        .where(eq(games.id, gameId));
      eliminated = { id: winner.playerId, name: winner.name };
    }
    return { results, eliminated };
  });

  if (!outcome) return undefined;

  if (outcome.eliminated) await checkGameOver(gameId);

  if (announce && process.env.ABLY_API_KEY) {
    try {
      const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
      await channel.publish(ABLY_EVENTS.vote_closed, {
        eliminated: outcome.eliminated,
        voteResults: outcome.results,
      });
    } catch (err) {
      console.error("[vote] vote_closed publish failed:", err);
    }
  }

  return { eliminated: outcome.eliminated };
}

/** Who a finished round eliminated, for requests that did not close it themselves. */
export async function findEliminated(gameId: string, round: { number: number }) {
  const [row] = await db
    .select({
      id: games.vote_eliminated_user_id,
      day: games.vote_eliminated_day,
      name: users.name,
    })
    .from(games)
    .innerJoin(users, eq(users.id, games.vote_eliminated_user_id))
    .where(eq(games.id, gameId))
    .limit(1);
  return row && row.id !== null && row.day === round.number
    ? { id: row.id, name: row.name }
    : null;
}
