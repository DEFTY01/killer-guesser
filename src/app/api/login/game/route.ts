import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, game_players, users } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import { normalizeJoinCode, JOIN_CODE_LENGTH } from "@/lib/credentials";

/**
 * GET /api/login/game?code=ABC234
 *
 * Public step 1 of player login: resolves a game code to the avatars that can
 * sign in to it. Only active or scheduled games are returned, and unknown
 * codes get the same 404 as closed ones.
 */
export async function GET(req: NextRequest) {
  const code = normalizeJoinCode(req.nextUrl.searchParams.get("code") ?? "");
  if (code.length !== JOIN_CODE_LENGTH) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  const rows = await db
    .select({
      gameName: games.name,
      id: users.id,
      nickname: users.name,
      avatarUrl: users.avatar_url,
    })
    .from(games)
    .innerJoin(game_players, eq(game_players.game_id, games.id))
    .innerJoin(users, eq(game_players.user_id, users.id))
    .where(
      and(
        eq(games.join_code, code),
        or(eq(games.status, "active"), eq(games.status, "scheduled")),
        eq(users.is_active, 1),
      ),
    )
    .orderBy(users.name)
    .limit(100);

  if (rows.length === 0) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        gameName: rows[0].gameName,
        players: rows.map((r) => ({
          id: String(r.id),
          nickname: r.nickname,
          avatarUrl: r.avatarUrl,
        })),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
