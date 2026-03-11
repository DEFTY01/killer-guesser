import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import {
  games,
  game_players,
  game_settings,
  roles,
  users,
  votes,
} from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { activateGameIfReady } from "@/lib/activateGame";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

// ── Zod schema ────────────────────────────────────────────────────

const patchGameSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_vote_window"),
    vote_window_start: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
      .nullable(),
    vote_window_end: z
      .string()
      .regex(/^\d{2}:\d{2}$/, "Must be HH:MM")
      .nullable(),
  }),
  z.object({
    action: z.literal("update_timezone"),
    timezone: z.string().min(1).max(100),
  }),
  z.object({
    action: z.literal("close_voting"),
  }),
  z.object({ action: z.literal("start") }),
  z.object({
    action: z.literal("close"),
    winner_team: z.enum(["team1", "team2"]).optional().nullable(),
  }),
  z.object({ action: z.literal("delete") }),
]);

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

  // Auto-activate if start_time has passed
  await activateGameIfReady(id);

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
 * - `"start"` — Activates a scheduled game by setting its status to `"active"`.
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

  const { action } = parsed.data;

  if (action === "start") {
    if (existing.status !== "scheduled") {
      return NextResponse.json(
        { success: false, error: "Only scheduled games can be started" },
        { status: 422 },
      );
    }
    const [updated] = await db
      .update(games)
      .set({ status: "active" })
      .where(eq(games.id, id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "delete") {
    // Hard-delete the game; related records cascade automatically.
    await db.delete(games).where(eq(games.id, id));
    return NextResponse.json({ success: true, data: { id } });
  }

  if (action === "update_vote_window") {
    const { vote_window_start, vote_window_end } = parsed.data;
    const [updated] = await db
      .update(games)
      .set({ vote_window_start, vote_window_end })
      .where(eq(games.id, id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "update_timezone") {
    const { timezone } = parsed.data;
    const [updated] = await db
      .update(games)
      .set({ timezone })
      .where(eq(games.id, id))
      .returning();
    return NextResponse.json({ success: true, data: updated });
  }

  if (action === "close_voting") {
    const [existing_game] = await db
      .select({ vote_window_start: games.vote_window_start })
      .from(games)
      .where(eq(games.id, id))
      .limit(1);

    const [updated] = await db
      .update(games)
      .set({ vote_window_start: null, vote_window_end: null })
      .where(eq(games.id, id))
      .returning();

    // Publish VOTE_CLOSED with vote results on the game channel.
    if (process.env.ABLY_API_KEY && existing_game?.vote_window_start) {
      const nowUnix = Math.floor(Date.now() / 1000);
      const currentDay = await db
        .select({ start_time: games.start_time })
        .from(games)
        .where(eq(games.id, id))
        .limit(1)
        .then(([g]) =>
          g ? Math.max(1, Math.floor((nowUnix - g.start_time) / 86400) + 1) : 1,
        );

      const voteResults = await db
        .select({
          target_id: votes.target_id,
          target_name: users.name,
          vote_count: count(votes.id),
        })
        .from(votes)
        .innerJoin(users, eq(votes.target_id, users.id))
        .where(and(eq(votes.game_id, id), eq(votes.day, currentDay)))
        .groupBy(votes.target_id, users.name);

      const channel = ablyServer.channels.get(ABLY_CHANNELS.game(id));
      await channel.publish(ABLY_EVENTS.vote_closed, { results: voteResults });
    }

    return NextResponse.json({ success: true, data: updated });
  }

  // action === "close"
  const closeData = parsed.data as { action: "close"; winner_team?: string | null };
  const [updated] = await db
    .update(games)
    .set({
      status: "closed",
      winner_team: closeData.winner_team ?? null,
    })
    .where(eq(games.id, id))
    .returning();

  return NextResponse.json({ success: true, data: updated });
}
