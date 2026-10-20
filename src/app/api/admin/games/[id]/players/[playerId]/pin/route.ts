import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { game_players } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { generatePin, hashPin } from "@/lib/credentials";

/**
 * POST /api/admin/games/[id]/players/[playerId]/pin
 *
 * Issues a fresh PIN for one game player and clears any lockout. The PIN is
 * returned once; only its hash is stored.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  if (!(await requireAdmin())) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id: gameId, playerId } = await params;
  const gamePlayerId = Number(playerId);
  if (!Number.isInteger(gamePlayerId)) {
    return NextResponse.json(
      { success: false, error: "Invalid player id" },
      { status: 422 },
    );
  }

  const pin = generatePin();
  const [updated] = await db
    .update(game_players)
    .set({
      pin_hash: hashPin(pin),
      pin_failed_attempts: 0,
      pin_locked_until: null,
    })
    .where(and(eq(game_players.id, gamePlayerId), eq(game_players.game_id, gameId)))
    .returning({ id: game_players.id });

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Player not found in this game" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: { pin } });
}
