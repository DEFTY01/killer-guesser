import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  games,
  game_players,
  game_settings,
  roles,
  users,
} from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── Zod schema ────────────────────────────────────────────────────

const patchGameSchema = z.object({
  action: z.enum(["close_voting", "close", "delete"]),
  winner_team: z.enum(["team1", "team2"]).optional().nullable(),
});

// ── GET /api/admin/games/[id] ─────────────────────────────────────

/**
 * GET /api/admin/games/[id]
 *
 * Returns the full game record including game settings and all participants
 * with their user info and assigned role details.
 *
 * @returns `{ success: true; data: { game, settings, players } }` or
 *          `{ success: false; error: string }`
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

  const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  const [[settings], players] = await Promise.all([
    db
      .select()
      .from(game_settings)
      .where(eq(game_settings.game_id, id))
      .limit(1),
    db
      .select({
        id: game_players.id,
        game_id: game_players.game_id,
        user_id: game_players.user_id,
        team: game_players.team,
        role_id: game_players.role_id,
        is_dead: game_players.is_dead,
        died_at: game_players.died_at,
        has_tipped: game_players.has_tipped,
        // user fields
        name: users.name,
        avatar_url: users.avatar_url,
        // role fields (nullable join)
        role_name: roles.name,
        role_color: roles.color_hex,
        role_team: roles.team,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .leftJoin(roles, eq(game_players.role_id, roles.id))
      .where(eq(game_players.game_id, id)),
  ]);

  return NextResponse.json({
    success: true,
    data: { game, settings: settings ?? null, players },
  });
}

// ── PATCH /api/admin/games/[id] ───────────────────────────────────

/**
 * PATCH /api/admin/games/[id]
 *
 * Updates the game state based on the `action` field in the request body:
 *
 * - `"close_voting"` — Closes the active vote window by nulling both
 *   `vote_window_start` and `vote_window_end` on the game record.
 * - `"close"` — Ends the game by setting its status to `"closed"`.
 *   An optional `winner_team` field ("team1" | "team2") may be provided.
 * - `"delete"` — Hard-deletes the game and all related records (game_players,
 *   votes, events, game_settings) via the existing CASCADE constraint.
 *
 * @returns `{ success: true; data: game | { id } }` or
 *          `{ success: false; error: string }`
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

  // Verify the game exists.
  const [existing] = await db
    .select({ id: games.id, status: games.status })
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = patchGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: `Invalid request: ${parsed.error.issues[0]?.message}` },
      { status: 422 },
    );
  }

  const { action, winner_team } = parsed.data;

  if (action === "delete") {
    // Hard-delete the game; related records cascade automatically.
    await db.delete(games).where(eq(games.id, id));
    return NextResponse.json({ success: true, data: { id } });
  }

  if (action === "close_voting") {
    const [updated] = await db
      .update(games)
      .set({ vote_window_start: null, vote_window_end: null })
      .where(eq(games.id, id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  // action === "close"
  const [updated] = await db
    .update(games)
    .set({
      status: "closed",
      winner_team: winner_team ?? null,
    })
    .where(eq(games.id, id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
