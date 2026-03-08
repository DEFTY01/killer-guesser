import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { game_players } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── Zod schema ────────────────────────────────────────────────────

const updateGamePlayerSchema = z.object({
  is_dead: z.number().int().min(0).max(1).optional(),
  role_id: z.number().int().positive().optional().nullable(),
});

// ── PATCH /api/admin/games/[id]/players/[playerId] ────────────────

/**
 * PATCH /api/admin/games/[id]/players/[playerId]
 *
 * Updates a single game_player record (marking a player dead or
 * assigning / changing their role).
 *
 * Body: `{ is_dead?: 0 | 1; role_id?: number | null }`
 *
 * @returns `{ success: true; data: GamePlayer }` or
 *          `{ success: false; error: string }`
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; playerId: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
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
  const parsed = updateGamePlayerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: `Invalid player update: ${parsed.error.issues[0]?.message}` },
      { status: 422 },
    );
  }

  if (
    parsed.data.is_dead === undefined &&
    parsed.data.role_id === undefined
  ) {
    return NextResponse.json(
      { success: false, error: "No fields to update" },
      { status: 422 },
    );
  }

  const updateData: Partial<{
    is_dead: number;
    died_at: number | null;
    role_id: number | null;
  }> = {};

  if (parsed.data.is_dead !== undefined) {
    updateData.is_dead = parsed.data.is_dead;
    updateData.died_at =
      parsed.data.is_dead === 1 ? Math.floor(Date.now() / 1000) : null;
  }

  if (parsed.data.role_id !== undefined) {
    updateData.role_id = parsed.data.role_id;
  }

  const [updated] = await db
    .update(game_players)
    .set(updateData)
    .where(
      and(
        eq(game_players.id, numericPlayerId),
        eq(game_players.game_id, gameId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Game player not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: updated });
}
