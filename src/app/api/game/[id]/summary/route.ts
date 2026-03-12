import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players, roles, users, votes } from "@/db/schema";
import { and, asc, count, eq } from "drizzle-orm";

// ── GET /api/game/[id]/summary ────────────────────────────────────

/**
 * Returns the post-game summary for a closed game, accessible to any player
 * who participated in it.
 *
 * Since the game is over, full team and role information is revealed so players
 * can review who had what role and which team won.
 *
 * @returns `{ success: true; data: { game, players, votes_by_day } }` or
 *          `{ success: false; error: string }`
 *
 * Requires a player session — returns 401 if not authenticated.
 * Returns 403 if the caller is not a participant in the game.
 * Returns 404 if the game does not exist.
 * Returns 409 if the game has not yet ended (status is not "closed").
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session || session.user?.role !== "player") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const userId = Number(session.user.id);
  if (isNaN(userId)) {
    return NextResponse.json(
      { success: false, error: "Invalid session" },
      { status: 401 },
    );
  }

  const { id } = await params;

  // ── Load game ─────────────────────────────────────────────────
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      winner_team: games.winner_team,
    })
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  // Only closed games have a summary
  if (game.status !== "closed") {
    return NextResponse.json(
      { success: false, error: "Game has not ended yet" },
      { status: 409 },
    );
  }

  // ── Verify caller is a participant ────────────────────────────
  const [callerRow] = await db
    .select({
      id: game_players.id,
      team: game_players.team,
      permissions: roles.permissions,
    })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(
      and(eq(game_players.game_id, id), eq(game_players.user_id, userId)),
    )
    .limit(1);

  if (!callerRow) {
    return NextResponse.json(
      { success: false, error: "Not a participant in this game" },
      { status: 403 },
    );
  }

  // ── Load all players ──────────────────────────────────────────
  const players = await db
    .select({
      id: game_players.id,
      user_id: game_players.user_id,
      team: game_players.team,
      is_dead: game_players.is_dead,
      died_location: game_players.died_location,
      died_time_of_day: game_players.died_time_of_day,
      revived_at: game_players.revived_at,
      death_reason: game_players.death_reason,
      name: users.name,
      avatar_url: users.avatar_url,
      role_name: roles.name,
      role_color: roles.color_hex,
      role_id: game_players.role_id,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(eq(game_players.game_id, id))
    .orderBy(users.name);

  // ── Identify killer role ──────────────────────────────────────
  const killerRoleRow = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "Killer"))
    .limit(1);
  const killerRoleId = killerRoleRow[0]?.id ?? null;

  // ── Vote tallies per day ──────────────────────────────────────
  const voteRows = await db
    .select({
      day: votes.day,
      target_id: votes.target_id,
      target_name: users.name,
      target_avatar: users.avatar_url,
      vote_count: count(votes.id),
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(eq(votes.game_id, id))
    .groupBy(votes.day, votes.target_id, users.name, users.avatar_url)
    .orderBy(asc(votes.day));

  const votes_by_day: Record<
    number,
    Array<{
      target_id: number;
      target_name: string;
      target_avatar: string | null;
      vote_count: number;
    }>
  > = {};
  for (const row of voteRows) {
    if (!votes_by_day[row.day]) {
      votes_by_day[row.day] = [];
    }
    votes_by_day[row.day].push({
      target_id: row.target_id,
      target_name: row.target_name,
      target_avatar: row.target_avatar,
      vote_count: row.vote_count,
    });
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        game,
        players,
        votes_by_day,
        caller_team: callerRow.team,
        caller_permissions: callerRow.permissions ?? null,
        killerRoleId,
      },
    },
    {
      headers: {
        // Closed-game summary is immutable — cache privately in the browser
        // for 1 hour to avoid redundant transfers on re-visits.
        "Cache-Control": "private, max-age=3600",
      },
    },
  );
}
