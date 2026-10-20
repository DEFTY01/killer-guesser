import { db } from "@/db";
import { game_players, games, roles, users, votes } from "@/db/schema";
import { and, asc, count, eq, gte, lt, sql } from "drizzle-orm";
import type { RolePermission } from "@/lib/role-constants";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { checkGameOver } from "@/lib/gameEnd";
import type { Round } from "@/lib/voteRound";

export function parsePermissions(raw: string | null | undefined): RolePermission[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RolePermission[]) : [];
  } catch {
    return [];
  }
}

/** Vote counts per target for one round, with target names. */
export async function loadResults(gameId: string, day: number) {
  const tally = await db
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
 * Tallies a round exactly once (the `vote_closed_day` claim is atomic) and
 * eliminates the player with a strict majority of the living voters. Returns
 * who was eliminated, or `undefined` when another request already closed it.
 */
export async function closeRound(
  gameId: string,
  round: Round,
): Promise<{ eliminated: { id: number; name: string } | null } | undefined> {
  const [claimed] = await db
    .update(games)
    .set({ vote_closed_day: round.number })
    .where(and(eq(games.id, gameId), lt(games.vote_closed_day, round.number)))
    .returning({ id: games.id });
  if (!claimed) return undefined;

  const [results, voterRows] = await Promise.all([
    loadResults(gameId, round.number),
    db
      .select({ is_dead: game_players.is_dead, permissions: roles.permissions })
      .from(game_players)
      .leftJoin(roles, eq(game_players.role_id, roles.id))
      .where(eq(game_players.game_id, gameId))
      .limit(50),
  ]);

  // Observers who know the killer cannot vote, so they do not count toward
  // the majority either.
  const eligibleVoters = voterRows.filter(
    (p) => p.is_dead === 0 && !parsePermissions(p.permissions).includes("see_killer"),
  ).length;

  const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);
  const top = sorted[0];
  const isStrictlyTop = top !== undefined && (sorted.length < 2 || sorted[1].voteCount < top.voteCount);
  const hasMajority = top !== undefined && top.voteCount * 2 > eligibleVoters;
  const winner = isStrictlyTop && hasMajority ? top : undefined;

  let eliminated: { id: number; name: string } | null = null;
  if (winner) {
    await db
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
    eliminated = { id: winner.playerId, name: winner.name };
    await checkGameOver(gameId);
  }

  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.vote_closed, {
      eliminated,
      voteResults: results,
    });
  }

  return { eliminated };
}

/** The evening elimination that followed a round, for requests that did not close it. */
export async function findEliminated(gameId: string, round: Round) {
  const [row] = await db
    .select({ user_id: game_players.user_id, name: users.name })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.is_dead, 1),
        eq(game_players.died_time_of_day, "evening"),
        gte(game_players.died_at, Math.floor(round.closeMs / 1000)),
      ),
    )
    .orderBy(asc(game_players.died_at))
    .limit(1);
  return row ? { id: row.user_id, name: row.name } : null;
}
