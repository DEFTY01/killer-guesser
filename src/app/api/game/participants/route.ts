import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";

/**
 * GET /api/game/participants
 *
 * Returns all players enrolled in the current player's active or scheduled
 * game, along with the game metadata needed for team badge labels.
 *
 * Response shape:
 *   {
 *     success: true;
 *     data: {
 *       game: { name: string; team1_name: string; team2_name: string };
 *       players: Array<{ id: number; name: string; avatar_url: string | null; team: "team1" | "team2" | null }>;
 *     }
 *   }
 *
 * Security: role_id and is_dead are intentionally omitted — this is the
 * pre-game / spectator view.
 */
export async function GET() {
  const session = await auth();

  if (!session || session.user?.role !== "player") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const gameId = session.user.activeGameId;
  if (!gameId) {
    return NextResponse.json(
      { success: false, error: "No active game" },
      { status: 404 },
    );
  }

  // Load game metadata (name + team names for badges).
  const [game] = await db
    .select({
      name: games.name,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
    })
    .from(games)
    .where(
      and(
        eq(games.id, gameId),
        or(eq(games.status, "active"), eq(games.status, "scheduled")),
      ),
    )
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found or not accessible" },
      { status: 404 },
    );
  }

  // Load all participants — only safe fields, no role or is_dead.
  const players = await db
    .select({
      id: users.id,
      name: users.name,
      avatar_url: users.avatar_url,
      team: game_players.team,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .where(eq(game_players.game_id, gameId))
    .orderBy(users.name);

  return NextResponse.json(
    {
      success: true,
      data: {
        game,
        players,
      },
    },
    {
      headers: {
        // Participant list is personalized and may change — do not cache.
        "Cache-Control": "no-store",
      },
    },
  );
}
