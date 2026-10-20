import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ablyServer } from "@/lib/ably";
import { db } from "@/db";
import { game_players, games } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";

type Capability = Record<string, "subscribe"[]>;

/**
 * GET /api/ably/token
 *
 * Issues a short-lived, subscribe-only Ably token request. The browser never
 * sees the API key. Players can only subscribe to the channels of games they
 * actually take part in, so one game cannot listen in on another; admins may
 * subscribe to any game.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Realtime is not configured" },
      { status: 503 },
    );
  }

  let capability: Capability;
  if (session.user.role === "admin") {
    capability = { "game-*": ["subscribe"], "vote-*": ["subscribe"] };
  } else {
    const userId = Number(session.user.id);
    const memberships = Number.isInteger(userId)
      ? await db
          .select({ gameId: game_players.game_id })
          .from(game_players)
          .innerJoin(games, eq(game_players.game_id, games.id))
          .where(
            and(
              eq(game_players.user_id, userId),
              inArray(games.status, ["scheduled", "active"]),
            ),
          )
          .limit(20)
      : [];

    if (memberships.length === 0) {
      return NextResponse.json(
        { success: false, error: "No game to follow" },
        { status: 403 },
      );
    }
    capability = {};
    for (const { gameId } of memberships) {
      capability[`game-${gameId}`] = ["subscribe"];
      capability[`vote-${gameId}-*`] = ["subscribe"];
    }
  }

  const tokenRequest = await ablyServer.auth.createTokenRequest({
    clientId: String(session.user.id),
    capability,
    ttl: 60 * 60 * 1000,
  });

  return NextResponse.json(tokenRequest, {
    headers: { "Cache-Control": "no-store" },
  });
}
