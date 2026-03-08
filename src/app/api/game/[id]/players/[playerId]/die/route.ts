import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

// ── Zod schema ────────────────────────────────────────────────────

const dieSchema = z.object({
  location: z.string().min(1, "Location is required").max(200),
  time_of_day: z.enum(["morning", "afternoon", "evening"]),
});

// ── PATCH /api/game/[id]/players/[playerId]/die ───────────────────

/**
 * PATCH /api/game/[id]/players/[playerId]/die
 *
 * Marks the calling player as dead with a location and time of day.
 * The caller must own the game_player record identified by playerId
 * (game_players.id).
 *
 * Body: { location: string; time_of_day: "morning" | "afternoon" | "evening" }
 *
 * @returns `{ success: true; data: GamePlayer }` or
 *          `{ success: false; error: string }`
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
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

  const { id: gameId, playerId } = await params;
  const numericPlayerId = Number(playerId);
  if (isNaN(numericPlayerId)) {
    return NextResponse.json(
      { success: false, error: "Invalid player id" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = dieSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid request: ${parsed.error.issues[0]?.message}`,
      },
      { status: 422 },
    );
  }

  const { location, time_of_day } = parsed.data;

  // Update only the record the calling user owns.
  const [updated] = await db
    .update(game_players)
    .set({
      is_dead: 1,
      died_at: Math.floor(Date.now() / 1000),
      died_location: location,
      died_time_of_day: time_of_day,
    })
    .where(
      and(
        eq(game_players.id, numericPlayerId),
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, userId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Player record not found or access denied" },
      { status: 404 },
    );
  }

  // Publish real-time event after successful mutation.
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.player_died, {
      player_id: updated.user_id,
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
