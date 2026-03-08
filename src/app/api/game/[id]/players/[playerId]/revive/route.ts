import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, roles } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { RolePermission } from "@/lib/role-constants";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

// ── Helpers ────────────────────────────────────────────────────────

function parsePermissions(raw: string | null | undefined): RolePermission[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RolePermission[]) : [];
  } catch {
    return [];
  }
}

// ── PATCH /api/game/[id]/players/[playerId]/revive ────────────────

/**
 * PATCH /api/game/[id]/players/[playerId]/revive
 *
 * Marks a dead player as revived by setting their `revived_at` timestamp.
 * The caller must have the `revive_dead` permission (Healer role).
 *
 * @returns `{ success: true; data: GamePlayer }` or
 *          `{ success: false; error: string }`
 */
export async function PATCH(
  _req: NextRequest,
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

  // ── Verify caller has revive_dead permission ─────────────────
  const [callerRow] = await db
    .select({ permissions: roles.permissions })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(
      and(eq(game_players.game_id, gameId), eq(game_players.user_id, userId)),
    )
    .limit(1);

  if (!callerRow) {
    return NextResponse.json(
      { success: false, error: "Not a participant in this game" },
      { status: 403 },
    );
  }

  const perms = parsePermissions(callerRow.permissions);
  if (!perms.includes("revive_dead")) {
    return NextResponse.json(
      { success: false, error: "Insufficient permissions" },
      { status: 403 },
    );
  }

  // ── Revive the target player ─────────────────────────────────
  const [updated] = await db
    .update(game_players)
    .set({ revived_at: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(game_players.id, numericPlayerId),
        eq(game_players.game_id, gameId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Player record not found" },
      { status: 404 },
    );
  }

  // Publish real-time event after successful mutation.
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.player_revived, {
      player_id: updated.user_id,
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
