import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users, game_players, votes } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

/** Zod schema for PATCH /api/admin/players/[id] body. */
const updatePlayerSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  avatar_url: z.string().url().optional().nullable(),
  is_active: z.number().int().min(0).max(1).optional(),
});

/**
 * GET /api/admin/players/[id]
 *
 * Returns the player record identified by `id`.
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return NextResponse.json(
      { success: false, error: "Invalid player id" },
      { status: 400 },
    );
  }

  const [player] = await db
    .select()
    .from(users)
    .where(eq(users.id, numericId))
    .limit(1);

  if (!player) {
    return NextResponse.json(
      { success: false, error: "Player not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: player });
}

/**
 * PATCH /api/admin/players/[id]
 *
 * Updates one or more fields on the player record identified by `id`.
 * Body: `{ name?: string; avatar_url?: string | null; is_active?: 0 | 1 }`
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return NextResponse.json(
      { success: false, error: "Invalid player id" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updatePlayerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const updateData: Partial<{
    name: string;
    avatar_url: string | null;
    is_active: number;
    updated_at: number;
  }> = {
    updated_at: Math.floor(Date.now() / 1000),
  };

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.avatar_url !== undefined)
    updateData.avatar_url = parsed.data.avatar_url;
  if (parsed.data.is_active !== undefined)
    updateData.is_active = parsed.data.is_active;

  const [updated] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, numericId))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Player not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/admin/players/[id]
 *
 * Hard-deletes the player account and all related records:
 * - All votes where the user is voter or target
 * - All game_players entries (cascade)
 * - The user record itself
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return NextResponse.json(
      { success: false, error: "Invalid player id" },
      { status: 400 },
    );
  }

  // Check if player exists
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.id, numericId))
    .limit(1);

  if (!existing.length) {
    return NextResponse.json(
      { success: false, error: "Player not found" },
      { status: 404 },
    );
  }

  // Delete all votes involving this user (as voter or target)
  await db
    .delete(votes)
    .where(
      sql`${votes.voter_id} = ${numericId} OR ${votes.target_id} = ${numericId}`,
    );

  // Delete all game_players entries (will cascade from user delete, but explicit for clarity)
  await db.delete(game_players).where(eq(game_players.user_id, numericId));

  // Delete the user
  await db.delete(users).where(eq(users.id, numericId));

  return NextResponse.json({ success: true, data: { id: numericId } });
}
