import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { games, game_settings, game_players, roles } from "@/db/schema";
import { desc, eq, sql, inArray } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { assignTeamsAndRoles } from "@/lib/assignTeamsAndRoles";

// ── Zod schema ────────────────────────────────────────────────────

const roleEntrySchema = z.object({
  roleId: z.number().int().positive(),
  chancePercent: z.number().min(0).max(100),
});

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
  player_ids: z
    .array(z.number().int().positive())
    .min(1, "At least one player is required"),
  team1_max_players: z.number().int().min(1).default(1),
  team2_max_players: z.number().int().min(1).default(1),
  team1Roles: z.array(roleEntrySchema).default([]),
  team1SpecialCount: z.number().int().nonnegative().default(0),
  team2Roles: z.array(roleEntrySchema).default([]),
  team2SpecialCount: z.number().int().nonnegative().default(0),
  murder_item_url: z.string().url().optional().nullable(),
  murder_item_name: z.string().optional().nullable(),
  revive_cooldown_seconds: z
    .number()
    .int()
    .nonnegative("revive_cooldown_seconds must be a non-negative integer")
    .optional()
    .nullable(),
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
 *   3. Server-side team & role assignment via `assignTeamsAndRoles`
 *   4. INSERT one row per player into `game_players`
 *
 * The server performs all team and role assignment — the client never
 * sends which player goes to which team or which role they receive.
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
    player_ids,
    team1_max_players,
    team2_max_players,
    team1Roles,
    team1SpecialCount,
    team2Roles,
    team2SpecialCount,
    murder_item_url,
    murder_item_name,
    revive_cooldown_seconds,
  } = parsed.data;

  // ── Resolve Killer & Survivor role IDs from the database ──────
  const allRoleIds = [
    ...team1Roles.map((r) => r.roleId),
    ...team2Roles.map((r) => r.roleId),
  ];

  let killerRoleId: number | null = null;
  let survivorRoleId: number | null = null;

  if (allRoleIds.length > 0) {
    const dbRoles = await db
      .select({ id: roles.id, name: roles.name, is_default: roles.is_default })
      .from(roles)
      .where(inArray(roles.id, allRoleIds));

    const killerRole = dbRoles.find(
      (r) => r.name.toLowerCase() === "killer",
    );
    killerRoleId = killerRole?.id ?? null;

    const survivorRole = dbRoles.find(
      (r) => r.name.toLowerCase() === "survivor" || r.is_default === 1,
    );
    survivorRoleId = survivorRole?.id ?? null;
  }

  // If no killer role was found in the provided roles, try to find one globally
  if (killerRoleId === null) {
    const [killerRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "Killer"))
      .limit(1);
    killerRoleId = killerRow?.id ?? null;
  }

  // If no survivor role was found, try to find one globally
  if (survivorRoleId === null) {
    const [survivorRow] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.name, "Survivor"))
      .limit(1);
    survivorRoleId = survivorRow?.id ?? null;
  }

  // ── Assign teams & roles server-side ─────────────────────────
  const playerAssignments = assignTeamsAndRoles({
    playerIds: player_ids,
    team1MaxPlayers: team1_max_players,
    team2MaxPlayers: team2_max_players,
    team1Roles,
    team1SpecialCount,
    killerRoleId: killerRoleId ?? 0,
    team2Roles,
    team2SpecialCount,
    survivorRoleId,
  });

  // ── Role config stored as JSON for reference ──────────────────
  const roleChancesJson = JSON.stringify({
    team1Roles,
    team1SpecialCount,
    team2Roles,
    team2SpecialCount,
  });

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
      special_role_count: team1SpecialCount + team2SpecialCount,
      role_chances: roleChancesJson,
      murder_item_url: murder_item_url ?? null,
      murder_item_name: murder_item_name ?? null,
      revive_cooldown_seconds: revive_cooldown_seconds ?? null,
    });

    if (playerAssignments.length > 0) {
      await tx.insert(game_players).values(
        playerAssignments.map((p) => ({
          game_id: game.id,
          user_id: p.userId,
          team: p.team,
          role_id: p.roleId,
        })),
      );
    }

    return game;
  });

  return NextResponse.json({ success: true, data: newGame }, { status: 201 });
}
