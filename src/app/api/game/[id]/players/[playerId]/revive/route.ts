import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, game_settings, roles } from "@/db/schema";
import { and, eq, max } from "drizzle-orm";
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

// ── POST /api/game/[id]/players/[playerId]/revive ─────────────────

/**
 * POST /api/game/[id]/players/[playerId]/revive
 *
 * Revives a dead player: sets `is_dead` to 0 and `revived_at` to the
 * current Unix timestamp.
 *
 * Requirements:
 * - Caller must be an authenticated player session.
 * - Caller must have the `revive_dead` permission (Healer role).
 * - Target player must currently be dead (`is_dead = 1`).
 * - If a `revive_cooldown_seconds` is configured for the game, the caller
 *   must wait that many seconds since the last revive before reviving again.
 *
 * On success, publishes a `PLAYER_REVIVED` Ably event on the game channel
 * with the full updated player record.
 *
 * @returns `{ success: true; data: GamePlayer }` or
 *          `{ success: false; error: string }`
 */
export async function POST(
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

  // ── Verify caller has revive_dead permission ──────────────────
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

  // ── Verify target is currently dead ──────────────────────────
  const [targetRow] = await db
    .select({ id: game_players.id, is_dead: game_players.is_dead })
    .from(game_players)
    .where(
      and(
        eq(game_players.id, numericPlayerId),
        eq(game_players.game_id, gameId),
      ),
    )
    .limit(1);

  if (!targetRow) {
    return NextResponse.json(
      { success: false, error: "Player record not found" },
      { status: 404 },
    );
  }

  if (targetRow.is_dead !== 1) {
    return NextResponse.json(
      { success: false, error: "Player is not dead" },
      { status: 409 },
    );
  }

  // ── Cooldown check ────────────────────────────────────────────
  const [settings] = await db
    .select({ revive_cooldown_seconds: game_settings.revive_cooldown_seconds })
    .from(game_settings)
    .where(eq(game_settings.game_id, gameId))
    .limit(1);

  const cooldown = settings?.revive_cooldown_seconds ?? null;

  if (cooldown !== null && cooldown > 0) {
    const [lastRevive] = await db
      .select({ last: max(game_players.revived_at) })
      .from(game_players)
      .where(eq(game_players.game_id, gameId));

    const lastReviveAt = lastRevive?.last ?? null;
    if (lastReviveAt !== null) {
      const nowSec = Math.floor(Date.now() / 1000);
      const elapsed = nowSec - lastReviveAt;
      if (elapsed < cooldown) {
        return NextResponse.json(
          {
            success: false,
            error: `Cooldown active — wait ${cooldown - elapsed}s before reviving again`,
          },
          { status: 429 },
        );
      }
    }
  }

  // ── Revive the target player ──────────────────────────────────
  const [updated] = await db
    .update(game_players)
    .set({ is_dead: 0, revived_at: Math.floor(Date.now() / 1000) })
    .where(
      and(
        eq(game_players.id, numericPlayerId),
        eq(game_players.game_id, gameId),
      ),
    )
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Revive failed" },
      { status: 500 },
    );
  }

  // ── Publish real-time event ───────────────────────────────────
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.player_revived, {
      player_id: updated.user_id,
      game_player_id: updated.id,
      revived_at: updated.revived_at,
    });
  }

  return NextResponse.json({ success: true, data: updated });
}
