import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";

// ── Shared select shape ───────────────────────────────────────────

function buildSelect() {
  return {
    id: games.id,
    name: games.name,
    status: games.status,
    start_time: games.start_time,
    team1_name: games.team1_name,
    team2_name: games.team2_name,
    winner_team: games.winner_team,
    player_count:
      sql<number>`(select count(*) from ${game_players} gp2 where gp2.game_id = ${games.id})`.as(
        "player_count",
      ),
  };
}

// ── GET /api/game/lobby ───────────────────────────────────────────

/**
 * Returns three groups of games for the current logged-in player:
 *   active   — games with status="active" where the user is a participant
 *   scheduled — games with status="scheduled" where the user is a participant
 *   past     — 5 most recent games with status="closed" where the user participated
 *              (sorted by start_time descending)
 *
 * Each game object includes: id, name, status, start_time, team1_name,
 * team2_name, winner_team, player_count.
 *
 * Past games additionally expose the player's own `user_team` so the client
 * can show a win/loss indicator.
 */
export async function GET() {
  const session = await auth();

  if (!session || session.user?.role !== "player") {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const userId = Number(session.user.id);
  if (!userId || isNaN(userId)) {
    return NextResponse.json(
      { success: false, error: "Invalid session" },
      { status: 401 },
    );
  }

  const sel = buildSelect();

  // ── Active games ───────────────────────────────────────────────
  const active = await db
    .select(sel)
    .from(games)
    .innerJoin(game_players, eq(games.id, game_players.game_id))
    .where(
      and(eq(games.status, "active"), eq(game_players.user_id, userId)),
    )
    .orderBy(desc(games.start_time));

  // ── Scheduled games ────────────────────────────────────────────
  const scheduled = await db
    .select(sel)
    .from(games)
    .innerJoin(game_players, eq(games.id, game_players.game_id))
    .where(
      and(eq(games.status, "scheduled"), eq(game_players.user_id, userId)),
    )
    .orderBy(desc(games.start_time));

  // ── Past (closed) games — last 5 ──────────────────────────────
  const pastRows = await db
    .select({
      ...sel,
      user_team: game_players.team,
    })
    .from(games)
    .innerJoin(game_players, eq(games.id, game_players.game_id))
    .where(
      and(eq(games.status, "closed"), eq(game_players.user_id, userId)),
    )
    .orderBy(desc(games.start_time))
    .limit(5);

  return NextResponse.json({
    active,
    scheduled,
    past: pastRows,
  });
}
