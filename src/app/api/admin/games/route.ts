import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { games, game_settings, game_players } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── Zod schema ────────────────────────────────────────────────────

const createGameSchema = z.object({
  name: z.string().min(1, "Name is required"),
  start_time: z
    .number()
    .int()
    .positive("start_time must be a positive unix timestamp"),
  vote_window_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "vote_window_start must be HH:MM")
    .optional()
    .nullable(),
  vote_window_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "vote_window_end must be HH:MM")
    .optional()
    .nullable(),
  team1_name: z.string().min(1, "team1_name is required").default("Good"),
  team2_name: z.string().min(1, "team2_name is required").default("Evil"),
  players: z
    .array(
      z.object({
        user_id: z.number().int().positive(),
        team: z.enum(["team1", "team2"]).nullable().optional(),
      }),
    )
    .min(1, "At least one player is required"),
  special_role_count: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .nullable(),
  role_chances: z.string().optional().nullable(),
  murder_item_url: z.string().url().optional().nullable(),
  murder_item_name: z.string().optional().nullable(),
});

// ── GET /api/admin/games ──────────────────────────────────────────

/**
 * Returns all games ordered by created_at desc.
 * Each row includes a `player_count` aggregate.
 * Requires an admin session.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const allGames = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      winner_team: games.winner_team,
      created_at: games.created_at,
      player_count: sql<number>`count(${game_players.id})`.as("player_count"),
    })
    .from(games)
    .leftJoin(game_players, eq(games.id, game_players.game_id))
    .groupBy(games.id)
    .orderBy(desc(games.created_at));

  return NextResponse.json({ success: true, data: allGames });
}

// ── POST /api/admin/games ─────────────────────────────────────────

/**
 * Creates a new game in a single database transaction:
 *   1. INSERT into `games`
 *   2. INSERT into `game_settings`
 *   3. INSERT one row per player into `game_players`
 *
 * If any insert fails the transaction rolls back entirely.
 * Requires an admin session.
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createGameSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const {
    name,
    start_time,
    vote_window_start,
    vote_window_end,
    team1_name,
    team2_name,
    players,
    special_role_count,
    role_chances,
    murder_item_url,
    murder_item_name,
  } = parsed.data;

  const newGame = await db.transaction(async (tx) => {
    const [game] = await tx
      .insert(games)
      .values({
        name,
        start_time,
        vote_window_start: vote_window_start ?? null,
        vote_window_end: vote_window_end ?? null,
        team1_name,
        team2_name,
      })
      .returning();

    await tx.insert(game_settings).values({
      game_id: game.id,
      special_role_count: special_role_count ?? null,
      role_chances: role_chances ?? null,
      murder_item_url: murder_item_url ?? null,
      murder_item_name: murder_item_name ?? null,
    });

    await tx.insert(game_players).values(
      players.map((p) => ({
        game_id: game.id,
        user_id: p.user_id,
        team: p.team ?? null,
      })),
    );

    return game;
  });

  return NextResponse.json({ success: true, data: newGame }, { status: 201 });
}
