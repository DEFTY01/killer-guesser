import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { game_players } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { PIN_LENGTH, hashPin } from "@/lib/credentials";

const bodySchema = z
  .object({
    pin: z
      .string()
      .regex(new RegExp(`^\\d{${PIN_LENGTH}}$`), `PIN must be ${PIN_LENGTH} digits`)
      .optional(),
  })
  .default({});

/**
 * POST /api/admin/games/[id]/players/[playerId]/pin
 *
 * Without a body: resets the player's PIN. They choose a new one the next
 * time they sign in. With `{ pin }`: the admin sets that PIN directly.
 * Either way any lockout is cleared. Only a hash is ever stored.
 */
export async function POST(
  req: NextRequest,
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

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const { pin } = parsed.data;
  const [updated] = await db
    .update(game_players)
    .set({
      pin_hash: pin ? await hashPin(pin) : null,
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

  return NextResponse.json({ success: true, data: { hasPin: Boolean(pin) } });
}
