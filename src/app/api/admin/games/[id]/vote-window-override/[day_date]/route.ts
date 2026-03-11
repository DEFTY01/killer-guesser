import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { vote_window_overrides } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── DELETE /api/admin/games/[id]/vote-window-override/[day_date] ──

/**
 * Deletes a specific vote window override for a game by its day_date.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; day_date: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id: gameId, day_date } = await params;

  await db
    .delete(vote_window_overrides)
    .where(
      and(
        eq(vote_window_overrides.game_id, gameId),
        eq(vote_window_overrides.day_date, day_date),
      ),
    );

  return NextResponse.json({ success: true });
}
