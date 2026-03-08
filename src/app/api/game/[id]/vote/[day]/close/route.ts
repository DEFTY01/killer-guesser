import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, games, users, votes } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

// ── POST /api/game/[id]/vote/[day]/close ──────────────────────────

/**
 * Closes the vote window for the given game day and publishes a
 * `vote_closed` Ably event to the game channel with the vote results.
 *
 * Called by the voting-page client when the countdown reaches zero.
 * This endpoint is intentionally idempotent — calling it multiple times
 * for the same day is safe; the event will be published each time but
 * the results view on the client is already showing.
 *
 * @returns `{ success: true; data: { results } }` or
 *          `{ success: false; error: string }`
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; day: string }> },
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

  const { id: gameId, day: dayParam } = await params;
  const day = Number(dayParam);
  if (isNaN(day) || day < 1) {
    return NextResponse.json(
      { success: false, error: "Invalid day" },
      { status: 400 },
    );
  }

  // ── Verify caller is a participant ────────────────────────────
  const [callerPlayer] = await db
    .select({ id: game_players.id })
    .from(game_players)
    .where(
      and(eq(game_players.game_id, gameId), eq(game_players.user_id, userId)),
    )
    .limit(1);

  if (!callerPlayer) {
    return NextResponse.json(
      { success: false, error: "Not a participant in this game" },
      { status: 403 },
    );
  }

  // ── Verify the game exists and vote window has ended ─────────
  const [game] = await db
    .select({ id: games.id, vote_window_end: games.vote_window_end })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  // Only allow closing when the vote window end time has passed (or is absent,
  // meaning the admin has already nulled it via close_voting).
  if (game.vote_window_end) {
    const endMs = Date.parse(game.vote_window_end);
    if (!isNaN(endMs) && Date.now() < endMs) {
      return NextResponse.json(
        { success: false, error: "Vote window has not ended yet" },
        { status: 409 },
      );
    }
  }

  // ── Compute vote results ──────────────────────────────────────
  const rawResults = await db
    .select({
      target_id: votes.target_id,
      target_name: users.name,
      vote_count: count(votes.id),
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
    .groupBy(votes.target_id, users.name);

  // ── Publish VOTE_CLOSED event ─────────────────────────────────
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.vote_closed, { results: rawResults });
  }

  return NextResponse.json({ success: true, data: { results: rawResults } });
}
