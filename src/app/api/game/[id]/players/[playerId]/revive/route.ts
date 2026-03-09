import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, game_settings, roles } from "@/db/schema";
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

// ── POST /api/game/[id]/players/[playerId]/revive ─────────────────

/**
 * POST /api/game/[id]/players/[playerId]/revive
 *
 * Revives a dead player: sets `is_dead` to 0, `is_revived` to 1, and
 * `revived_at` to the current Unix timestamp.
 *
 * Requirements:
 * - Caller must be an authenticated player session.
 * - Caller must have the `revive_dead` permission (Medic role).
 * - Caller must not be dead.
 * - Caller cannot revive themselves.
 * - Target player must be dead (`is_dead = 1`).
 * - Target must not already be revived (`is_revived = 0`).
 * - Target must not be on the evil team (`roles.is_evil = 0`).
 * - Cooldown: `revive_cooldown_minutes` from game_settings must have elapsed
 *   since the Medic's `last_revive_at`.
 *
 * On success, updates the Medic's `last_revive_at`, publishes a
 * `PLAYER_REVIVED` Ably event with the full updated player record.
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

  // ── Verify caller has revive_dead permission and is alive ─────
  const [callerRow] = await db
    .select({
      id: game_players.id,
      permissions: roles.permissions,
      is_dead: game_players.is_dead,
      last_revive_at: game_players.last_revive_at,
    })
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
      { success: false, error: "You are not the Medic." },
      { status: 403 },
    );
  }

  if (callerRow.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "The Medic cannot revive while dead." },
      { status: 403 },
    );
  }

  if (callerRow.id === numericPlayerId) {
    return NextResponse.json(
      { success: false, error: "The Medic cannot revive himself." },
      { status: 403 },
    );
  }

  // ── Verify target: exists, is dead, not undead, not evil ──────
  const [targetRow] = await db
    .select({
      id: game_players.id,
      is_dead: game_players.is_dead,
      is_revived: game_players.is_revived,
      role_is_evil: roles.is_evil,
    })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
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
      { success: false, error: "That player is not dead." },
      { status: 403 },
    );
  }

  if (targetRow.is_revived === 1) {
    return NextResponse.json(
      { success: false, error: "Cannot revive an Undead player." },
      { status: 403 },
    );
  }

  if (targetRow.role_is_evil === 1) {
    return NextResponse.json(
      { success: false, error: "Cannot revive an Evil team member." },
      { status: 403 },
    );
  }

  // ── Cooldown check ────────────────────────────────────────────
  const [settings] = await db
    .select({ revive_cooldown_minutes: game_settings.revive_cooldown_minutes })
    .from(game_settings)
    .where(eq(game_settings.game_id, gameId))
    .limit(1);

  const cooldownMinutes = settings?.revive_cooldown_minutes ?? null;

  if (cooldownMinutes !== null && cooldownMinutes > 0) {
    const lastReviveAt = callerRow.last_revive_at ?? null;
    if (lastReviveAt !== null) {
      const nowSec = Math.floor(Date.now() / 1000);
      const elapsed = nowSec - lastReviveAt;
      const cooldownSec = cooldownMinutes * 60;
      if (elapsed < cooldownSec) {
        const remainingMin = Math.ceil((cooldownSec - elapsed) / 60);
        return NextResponse.json(
          {
            success: false,
            error: `Revive on cooldown. Try again in ${remainingMin} minute${remainingMin === 1 ? "" : "s"}.`,
          },
          { status: 403 },
        );
      }
    }
  }

  // ── Revive the target player ──────────────────────────────────
  const nowTs = Math.floor(Date.now() / 1000);
  const [updated] = await db
    .update(game_players)
    .set({ is_dead: 0, is_revived: 1, revived_at: nowTs })
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

  // ── Update the Medic's last_revive_at ─────────────────────────
  await db
    .update(game_players)
    .set({ last_revive_at: nowTs })
    .where(eq(game_players.id, callerRow.id));

  // ── Publish real-time event ───────────────────────────────────
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.player_revived, {
      player_id: updated.user_id,
      game_player_id: updated.id,
      revived_at: updated.revived_at,
      is_revived: updated.is_revived,
      updated_player: updated,
    });
  }

  return NextResponse.json({ success: true, data: updated });
}

