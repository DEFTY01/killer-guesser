import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import {
  games,
  game_players,
  game_settings,
  roles,
  users,
  votes,
} from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { DEFAULT_ROLE_COLOR } from "@/lib/role-constants";
import type { RolePermission } from "@/lib/role-constants";

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

// ── GET /api/game/[id]/board ───────────────────────────────────────

/**
 * Returns the game board data for the active game, filtered by the caller's
 * role permissions.
 *
 * All callers receive:
 *  - players[]: id (game_player id), user_id, name, avatar_url, team,
 *               is_dead, revived_at, role_color
 *  - game metadata: name, team1_name, team2_name, vote windows, current_day
 *  - settings: murder_item_url, murder_item_name
 *  - caller: game_player_id, user_id, permissions[]
 *
 * If the caller has `see_killer` permission:
 *  - killer_id: the user_id of the player with role name "Killer"
 *
 * If the caller has `see_votes` permission:
 *  - votes[]: today's { voter_id, target_id } entries
 *
 * **Security constraint:** The `killer_id` field is **only** included in the
 * response when the authenticated caller's role grants the `see_killer`
 * permission (e.g. the Seer role).  For every other role the field is omitted
 * entirely so that the killer's identity is never leaked to unauthorised
 * players.
 *
 * **Mayor anonymisation:** When the caller's role is "Mayor", every player
 * object is stripped down to `{ id, user_id, name, avatar_url, is_dead,
 * revived_at }` only.  The `role_color` and `team` fields are omitted so
 * that the Mayor cannot infer any faction or role information from the
 * response.  The Mayor cannot revive, cannot see the killer, and cannot see
 * votes — their only action is to vote like everyone else.
 */
export async function GET(
  _req: NextRequest,
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

  // ── Load game ─────────────────────────────────────────────────
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
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

  // ── Load settings ─────────────────────────────────────────────
  const [settings] = await db
    .select({
      murder_item_url: game_settings.murder_item_url,
      murder_item_name: game_settings.murder_item_name,
    })
    .from(game_settings)
    .where(eq(game_settings.game_id, gameId))
    .limit(1);

  // ── Verify caller is a participant and load their permissions ──
  const [callerRow] = await db
    .select({
      game_player_id: game_players.id,
      permissions: roles.permissions,
      role_name: roles.name,
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
      team: game_players.team,
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
      role_color: roles.color_hex,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(eq(game_players.game_id, gameId))
    .orderBy(users.name);

  // Normalise: replace null role_color with the default blue
  const normalizedPlayers = players.map((p) => ({
    ...p,
    role_color: p.role_color ?? DEFAULT_ROLE_COLOR,
  }));

  // ── Mayor anonymisation: strip role/team data ─────────────────
  // The Mayor's view is deliberately equalized — they cannot see role colours
  // or team badges.  Strip every field except the bare minimum needed to
  // render a face-and-name card.
  const isMayor = callerRow.role_name === "Mayor";
  const responsePlayers = isMayor
    ? normalizedPlayers.map(({ id, user_id, name, avatar_url, is_dead, revived_at }) => ({
        id,
        user_id,
        name,
        avatar_url,
        is_dead,
        revived_at,
      }))
    : normalizedPlayers;

  // ── Current game day ──────────────────────────────────────────
  const nowUnix = Math.floor(Date.now() / 1000);
  const currentDay = Math.max(
    1,
    Math.floor((nowUnix - game.start_time) / 86400) + 1,
  );

  // ── Build base response ───────────────────────────────────────
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
    settings: {
      murder_item_url: string | null;
      murder_item_name: string | null;
    };
    caller: {
      game_player_id: number;
      user_id: number;
      permissions: RolePermission[];
      role_name: string | null;
    };
    players: typeof responsePlayers;
    killer_id?: number | null;
    votes?: Array<{ voter_id: number; target_id: number }>;
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
    settings: {
      murder_item_url: settings?.murder_item_url ?? null,
      murder_item_name: settings?.murder_item_name ?? null,
    },
    caller: {
      game_player_id: callerRow.game_player_id,
      user_id: userId,
      permissions: callerPermissions,
      role_name: callerRow.role_name ?? null,
    },
    players: responsePlayers,
  };

  // ── see_killer permission: include killer's user_id ───────────
  if (callerPermissions.includes("see_killer")) {
    const [killerRow] = await db
      .select({ user_id: game_players.user_id })
      .from(game_players)
      .innerJoin(roles, eq(game_players.role_id, roles.id))
      .where(
        and(eq(game_players.game_id, gameId), eq(roles.name, "Killer")),
      )
      .limit(1);

    data.killer_id = killerRow?.user_id ?? null;
  }

  // ── see_votes permission: include today's vote details ────────
  if (callerPermissions.includes("see_votes")) {
    const todayVotes = await db
      .select({
        voter_id: votes.voter_id,
        target_id: votes.target_id,
      })
      .from(votes)
      .where(and(eq(votes.game_id, gameId), eq(votes.day, currentDay)));

    data.votes = todayVotes;
  }

  return NextResponse.json({ success: true, data });
}
