import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, games, roles, users, votes } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { RolePermission } from "@/lib/role-constants";
import { DEFAULT_ROLE_COLOR } from "@/lib/role-constants";
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

// ── GET /api/game/[id]/vote/[day] ─────────────────────────────────

/**
 * Returns the data needed to render the voting page for a given game day.
 *
 * All callers receive:
 *  - game metadata (name, team names, vote window, current_day)
 *  - players[] (id, user_id, name, is_dead) as voting targets
 *  - caller info (user_id, game_player_id, permissions[])
 *  - has_voted: whether the caller has already voted today
 *
 * Callers with `see_votes` permission additionally receive:
 *  - votes[]: all votes cast today with voter/target names
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; day: string }> },
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

  const { id: gameId, day: dayParam } = await params;
  const day = Number(dayParam);
  if (isNaN(day) || day < 1) {
    return NextResponse.json(
      { success: false, error: "Invalid day" },
      { status: 400 },
    );
  }

  // ── Load game ─────────────────────────────────────────────────
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
    })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  // ── Verify caller is a participant ────────────────────────────
  const [callerRow] = await db
    .select({
      game_player_id: game_players.id,
      permissions: roles.permissions,
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

  const callerPermissions = parsePermissions(callerRow.permissions);

  // ── Load all players ──────────────────────────────────────────
  const players = await db
    .select({
      id: game_players.id,
      user_id: game_players.user_id,
      name: users.name,
      avatar_url: users.avatar_url,
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
      role_color: roles.color_hex,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(eq(game_players.game_id, gameId))
    .orderBy(users.name);

  const normalizedPlayers = players.map((p) => ({
    ...p,
    role_color: p.role_color ?? DEFAULT_ROLE_COLOR,
  }));

  // ── Check if caller already voted today ───────────────────────
  const [existingVote] = await db
    .select({ id: votes.id })
    .from(votes)
    .where(
      and(
        eq(votes.game_id, gameId),
        eq(votes.day, day),
        eq(votes.voter_id, userId),
      ),
    )
    .limit(1);

  // ── Compute current day ───────────────────────────────────────
  const nowUnix = Math.floor(Date.now() / 1000);
  const currentDay = Math.max(
    1,
    Math.floor((nowUnix - game.start_time) / 86400) + 1,
  );

  // ── Build response ────────────────────────────────────────────
  const data: {
    game: {
      id: string;
      name: string;
      team1_name: string;
      team2_name: string;
      vote_window_start: string | null;
      vote_window_end: string | null;
      current_day: number;
    };
    caller: {
      user_id: number;
      game_player_id: number;
      permissions: RolePermission[];
    };
    players: typeof normalizedPlayers;
    has_voted: boolean;
    votes?: Array<{
      voter_id: number;
      voter_name: string;
      voter_avatar_url: string | null;
      target_id: number;
      target_name: string;
      target_avatar_url: string | null;
    }>;
  } = {
    game: {
      id: game.id,
      name: game.name,
      team1_name: game.team1_name,
      team2_name: game.team2_name,
      vote_window_start: game.vote_window_start,
      vote_window_end: game.vote_window_end,
      current_day: currentDay,
    },
    caller: {
      user_id: userId,
      game_player_id: callerRow.game_player_id,
      permissions: callerPermissions,
    },
    players: normalizedPlayers,
    has_voted: !!existingVote,
  };

  // ── see_votes permission: include all today's votes ───────────
  if (callerPermissions.includes("see_votes")) {
    const enrichedVotes = await db
      .select({
        voter_id: votes.voter_id,
        voter_name: users.name,
        target_id: votes.target_id,
      })
      .from(votes)
      .innerJoin(users, eq(votes.voter_id, users.id))
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)));

    // Build a lookup map for O(1) access instead of repeated O(n) find calls
    const playerByUserId = new Map(
      normalizedPlayers.map((p) => [p.user_id, p]),
    );

    // Enrich with target names using the players list we already loaded
    data.votes = enrichedVotes.map((v) => ({
      voter_id: v.voter_id,
      voter_name: v.voter_name,
      voter_avatar_url: playerByUserId.get(v.voter_id)?.avatar_url ?? null,
      target_id: v.target_id,
      target_name: playerByUserId.get(v.target_id)?.name ?? "Unknown",
      target_avatar_url: playerByUserId.get(v.target_id)?.avatar_url ?? null,
    }));
  }

  return NextResponse.json({ success: true, data });
}

// ── POST /api/game/[id]/vote/[day] ────────────────────────────────

const voteSchema = z.object({
  target_id: z.number().int().positive(),
});

/**
 * Submits a vote for a target player on the given game day.
 *
 * - The caller must be a participant in the game and alive.
 * - Only one vote per player per day is allowed.
 * - After inserting, publishes a `vote_cast` Ably event on the vote channel.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; day: string }> },
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

  const { id: gameId, day: dayParam } = await params;
  const day = Number(dayParam);
  if (isNaN(day) || day < 1) {
    return NextResponse.json(
      { success: false, error: "Invalid day" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = voteSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid request: ${parsed.error.issues[0]?.message}`,
      },
      { status: 422 },
    );
  }

  const { target_id } = parsed.data;

  // ── Verify caller is a participant ────────────────────────────
  const [callerPlayer] = await db
    .select({ id: game_players.id, is_dead: game_players.is_dead, revived_at: game_players.revived_at })
    .from(game_players)
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

  // Dead players may not vote.
  if (callerPlayer.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "Dead players cannot vote" },
      { status: 403 },
    );
  }

  // ── Check for duplicate vote ──────────────────────────────────
  const [existing] = await db
    .select({ id: votes.id })
    .from(votes)
    .where(
      and(
        eq(votes.game_id, gameId),
        eq(votes.day, day),
        eq(votes.voter_id, userId),
      ),
    )
    .limit(1);

  if (existing) {
    return NextResponse.json(
      { success: false, error: "You have already voted today" },
      { status: 409 },
    );
  }

  // ── Insert vote ───────────────────────────────────────────────
  const [inserted] = await db
    .insert(votes)
    .values({ game_id: gameId, day, voter_id: userId, target_id })
    .returning();

  // ── Load voter and target names + avatars for the Ably payload ─────────
  const [voterUser] = await db
    .select({ name: users.name, avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const [targetUser] = await db
    .select({ name: users.name, avatar_url: users.avatar_url })
    .from(users)
    .where(eq(users.id, target_id))
    .limit(1);

  // ── Publish VOTE_CAST event ───────────────────────────────────
  if (process.env.ABLY_API_KEY) {
    const channel = ablyServer.channels.get(ABLY_CHANNELS.vote(gameId, day));
    await channel.publish(ABLY_EVENTS.vote_cast, {
      voter_id: userId,
      voter_name: voterUser?.name ?? "Unknown",
      voter_avatar_url: voterUser?.avatar_url ?? null,
      target_id,
      target_name: targetUser?.name ?? "Unknown",
      target_avatar_url: targetUser?.avatar_url ?? null,
    });
  }

  return NextResponse.json({ success: true, data: inserted }, { status: 201 });
}
