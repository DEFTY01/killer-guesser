import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, roles, users } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { handleKillerDefeated } from "@/lib/gameEnd";

// ── Schema ────────────────────────────────────────────────────────

const tipSchema = z.object({
  suspectId: z.number().int().positive(),
});

// ── POST /api/game/[id]/tip ───────────────────────────────────────

/**
 * POST /api/game/[id]/tip
 *
 * Allows a living, non-killer player to accuse a suspect of being the killer.
 * Each player may only use this ability once per game (`has_tipped = 0`).
 *
 * **Guards (all return 403 unless noted):**
 * - Caller is dead → "You are already dead."
 * - Caller has already tipped (`has_tipped = 1`) → "Already used."
 * - Caller is the killer → "Killer cannot tip."
 * - `suspectId` not found among alive players → 404
 *
 * **Correct guess** (`suspectId` = killer's `user_id`):
 * - In a single DB transaction:
 *   - Killer: `is_dead = 1`, `died_time_of_day = "day"`
 *   - Caller: `has_tipped = 1`
 * - Calls `handleKillerDefeated(gameId)` → publishes `GAME_ENDED`.
 * - Returns `{ correct: true }`
 *
 * **Wrong guess** (`suspectId` ≠ killer):
 * - In a single DB transaction:
 *   - Caller: `is_dead = 1`, `died_time_of_day = "day"`, `has_tipped = 1`
 * - Publishes `PLAYER_DIED` on the game channel.
 * - Returns `{ correct: false }`
 *
 * @returns `{ success: true; data: { correct: boolean } }` or
 *          `{ success: false; error: string }`
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
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

  const { id: gameId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = tipSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid request: ${parsed.error.issues[0]?.message}`,
      },
      { status: 422 },
    );
  }

  const { suspectId } = parsed.data;

  // ── Load caller's game_player row ─────────────────────────────
  const [callerPlayer] = await db
    .select({
      id: game_players.id,
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
      has_tipped: game_players.has_tipped,
      role_name: roles.name,
    })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(
      and(eq(game_players.game_id, gameId), eq(game_players.user_id, userId)),
    )
    .limit(1);

  if (!callerPlayer) {
    return NextResponse.json(
      { success: false, error: "Not a participant in this game" },
      { status: 403 },
    );
  }

  // Guard: caller is dead
  if (callerPlayer.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "You are already dead." },
      { status: 403 },
    );
  }

  // Guard: caller has already tipped
  if (callerPlayer.has_tipped === 1) {
    return NextResponse.json(
      { success: false, error: "Already used." },
      { status: 403 },
    );
  }

  // Guard: caller is the killer
  if (callerPlayer.role_name === "Killer") {
    return NextResponse.json(
      { success: false, error: "Killer cannot tip." },
      { status: 403 },
    );
  }

  // ── Verify suspect exists and is alive ────────────────────────
  const [suspectPlayer] = await db
    .select({
      id: game_players.id,
      user_id: game_players.user_id,
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
      role_name: roles.name,
    })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, suspectId),
      ),
    )
    .limit(1);

  if (
    !suspectPlayer ||
    suspectPlayer.is_dead === 1
  ) {
    return NextResponse.json(
      { success: false, error: "Suspect not found among alive players" },
      { status: 404 },
    );
  }

  const isCorrect = suspectPlayer.role_name === "Killer";

  if (isCorrect) {
    // ── Correct guess ───────────────────────────────────────────
    await db.transaction(async (tx) => {
      // Eliminate the killer (died during the day).
      await tx
        .update(game_players)
        .set({
          is_dead: 1,
          died_at: sql<number>`(unixepoch())`,
          died_time_of_day: "day",
        })
        .where(
          and(
            eq(game_players.game_id, gameId),
            eq(game_players.user_id, suspectId),
          ),
        );

      // Mark caller as having used their tip.
      await tx
        .update(game_players)
        .set({ has_tipped: 1 })
        .where(eq(game_players.id, callerPlayer.id));
    });

    // Trigger game-end logic (archives events, closes game, publishes GAME_ENDED).
    await handleKillerDefeated(gameId);

    return NextResponse.json({ success: true, data: { correct: true } });
  }

  // ── Wrong guess ─────────────────────────────────────────────────

  // Load caller's name for the Ably payload.
  const [callerUser] = await db
    .select({ name: users.name })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  await db.transaction(async (tx) => {
    // Caller dies as penalty (died during the day).
    await tx
      .update(game_players)
      .set({
        is_dead: 1,
        died_at: sql<number>`(unixepoch())`,
        died_time_of_day: "day",
        has_tipped: 1,
      })
      .where(eq(game_players.id, callerPlayer.id));
  });

  // Publish PLAYER_DIED on the game channel.
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
    await channel.publish(ABLY_EVENTS.player_died, {
      player_id: userId,
      player_name: callerUser?.name ?? "Unknown",
    });
  }

  return NextResponse.json({ success: true, data: { correct: false } });
}
