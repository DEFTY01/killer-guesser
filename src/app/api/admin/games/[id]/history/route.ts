import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, game_players, users, roles, events, votes } from "@/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── GET /api/admin/games/[id]/history ─────────────────────────────

/**
 * GET /api/admin/games/[id]/history
 *
 * Returns the full archived record of a game, intended for read-only
 * post-game review. The response includes:
 *
 * - **game** — Full game metadata (name, status, start_time, winner_team, etc.)
 * - **players** — All participants with their user info (name, avatar_url),
 *   team assignment, role details (name, color), and fate data
 *   (is_dead, died_at, died_location, died_time_of_day, revived_at).
 * - **events** — All archived events (`is_archived = 1`) in chronological
 *   order (ascending by `created_at`), each with day, type, and payload.
 * - **votes_by_day** — All votes grouped by day. Each day entry contains
 *   anonymous tallies: the target player's id, name, and avatar, plus the
 *   total vote count for that target on that day. Voter identities are
 *   intentionally omitted.
 *
 * @returns `{ success: true; data: { game, players, events, votes_by_day } }` or
 *          `{ success: false; error: string }`
 *
 * Requires an admin session — returns 403 if not authenticated as admin.
 * Returns 404 if the game does not exist.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;

  // Fetch game metadata.
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  // Fetch all data in parallel.
  const [players, archivedEvents, voteRows] = await Promise.all([
    // Players with user info and role details.
    db
      .select({
        id: game_players.id,
        game_id: game_players.game_id,
        user_id: game_players.user_id,
        team: game_players.team,
        role_id: game_players.role_id,
        is_dead: game_players.is_dead,
        died_at: game_players.died_at,
        died_location: game_players.died_location,
        died_time_of_day: game_players.died_time_of_day,
        revived_at: game_players.revived_at,
        has_tipped: game_players.has_tipped,
        // user fields
        name: users.name,
        avatar_url: users.avatar_url,
        // role fields (nullable join)
        role_name: roles.name,
        role_color: roles.color_hex,
        role_team: roles.team,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .leftJoin(roles, eq(game_players.role_id, roles.id))
      .where(eq(game_players.game_id, id)),

    // All archived events in chronological order.
    db
      .select({
        id: events.id,
        day: events.day,
        type: events.type,
        payload: events.payload,
        created_at: events.created_at,
      })
      .from(events)
      .where(eq(events.game_id, id))
      .orderBy(asc(events.created_at)),

    // Vote tallies per target per day (anonymous — no voter identities).
    db
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
      .orderBy(asc(votes.day)),
  ]);

  // Group vote tallies by day.
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

  return NextResponse.json({
    success: true,
    data: {
      game,
      players,
      events: archivedEvents,
      votes_by_day,
    },
  });
}
