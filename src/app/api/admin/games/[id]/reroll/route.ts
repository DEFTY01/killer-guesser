import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, game_players, game_settings, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { fisherYatesShuffle, resolveKillerCap } from "@/lib/assignTeamsAndRoles";

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Weighted random selection from a list of items.
 * Each item must have a `weight` field (>= 0).
 * Returns `null` if all weights are 0.
 */
function weightedPick<T extends { weight: number }>(items: T[]): T | null {
  const total = items.reduce((sum, r) => sum + r.weight, 0);
  if (total === 0) return null;
  let rand = Math.random() * total;
  for (const item of items) {
    rand -= item.weight;
    if (rand <= 0) return item;
  }
  return items[items.length - 1] ?? null;
}

// ── POST /api/admin/games/[id]/reroll ─────────────────────────────

/**
 * POST /api/admin/games/[id]/reroll
 *
 * Re-randomises either the **teams** or the **roles** for all players in a game.
 *
 * Query parameter: `type=teams` | `type=roles`
 *
 * - `teams` — Splits players into Evil/Good teams using the player-count-based
 *   Killer cap rules (resolveKillerCap). The evil team size is determined by
 *   the admin cap stored in game_settings, capped by resolveKillerCap.
 * - `roles` — Assigns each player a role via weighted random selection.
 *   Evil roles (is_evil=1) go only to the Evil team; Good roles (is_evil=0)
 *   go only to the Good team. The Killer role is always assigned to exactly
 *   one Evil team player first.
 *
 * @returns `{ success: true; data: { players } }` or
 *          `{ success: false; error: string }`
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function POST(
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

  const type = new URL(req.url).searchParams.get("type");
  if (type !== "teams" && type !== "roles") {
    return NextResponse.json(
      { success: false, error: 'Query parameter "type" must be "teams" or "roles"' },
      { status: 400 },
    );
  }

  // Verify game exists and get evil_team_is_team1 flag.
  const [game] = await db
    .select({ id: games.id, evil_team_is_team1: games.evil_team_is_team1 })
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  const isEvilTeam1 = game.evil_team_is_team1 === 1;

  // Fetch current game players.
  const players = await db
    .select({
      id: game_players.id,
      team: game_players.team,
    })
    .from(game_players)
    .where(eq(game_players.game_id, id));

  if (players.length === 0) {
    return NextResponse.json(
      { success: false, error: "No players in this game" },
      { status: 422 },
    );
  }

  if (type === "teams") {
    // Fetch game settings for the admin-requested evil team cap.
    const [settings] = await db
      .select({
        team1_max_players: game_settings.team1_max_players,
        team2_max_players: game_settings.team2_max_players,
      })
      .from(game_settings)
      .where(eq(game_settings.game_id, id))
      .limit(1);

    const adminEvilCap = isEvilTeam1
      ? (settings?.team1_max_players ?? 1)
      : (settings?.team2_max_players ?? 1);

    // Apply killer cap rules: resolve the actual evil team size.
    const resolvedEvilCap = resolveKillerCap(players.length, adminEvilCap);

    const shuffled = fisherYatesShuffle([...players]);
    const evilTeam: "team1" | "team2" = isEvilTeam1 ? "team1" : "team2";
    const goodTeam: "team1" | "team2" = isEvilTeam1 ? "team2" : "team1";

    await db.transaction(async (tx) => {
      for (let i = 0; i < shuffled.length; i++) {
        const team = i < resolvedEvilCap ? evilTeam : goodTeam;
        await tx
          .update(game_players)
          .set({ team })
          .where(eq(game_players.id, shuffled[i].id));
      }
    });

    const updated = await db
      .select()
      .from(game_players)
      .where(eq(game_players.game_id, id));

    return NextResponse.json({ success: true, data: { players: updated } });
  }

  // type === "roles": weighted random assignment per player, respecting is_evil constraints.
  const allRoles = await db.select().from(roles);

  if (allRoles.length === 0) {
    return NextResponse.json(
      { success: false, error: "No roles configured" },
      { status: 422 },
    );
  }

  const killerRole = allRoles.find((r) => r.name.toLowerCase() === "killer");
  const evilTeamId: "team1" | "team2" = isEvilTeam1 ? "team1" : "team2";
  const goodTeamId: "team1" | "team2" = isEvilTeam1 ? "team2" : "team1";

  // Separate players by team.
  const evilPlayers = players.filter((p) => p.team === evilTeamId);
  const goodPlayers = players.filter((p) => p.team === goodTeamId);
  const unassigned = players.filter((p) => p.team === null);

  // Roles eligible for each side.
  const evilEligibleRoles = allRoles
    .filter((r) => r.is_evil === 1)
    .map((r) => ({ ...r, weight: r.chance_percent }));

  const goodEligibleRoles = allRoles
    .filter((r) => r.is_evil === 0)
    .map((r) => ({ ...r, weight: r.chance_percent }));

  await db.transaction(async (tx) => {
    // Assign Killer to exactly one random Evil team player first.
    const shuffledEvil = fisherYatesShuffle([...evilPlayers]);
    let killerAssigned = false;

    for (const player of shuffledEvil) {
      if (killerRole && !killerAssigned) {
        await tx
          .update(game_players)
          .set({ role_id: killerRole.id })
          .where(eq(game_players.id, player.id));
        killerAssigned = true;
      } else {
        // Remaining evil players get non-killer evil roles.
        const pool = evilEligibleRoles.filter(
          (r) => !killerRole || r.id !== killerRole.id,
        );
        const picked = weightedPick(pool.length > 0 ? pool : evilEligibleRoles);
        await tx
          .update(game_players)
          .set({ role_id: picked?.id ?? null })
          .where(eq(game_players.id, player.id));
      }
    }

    // Good team players get only is_evil=0 roles.
    for (const player of goodPlayers) {
      const picked = weightedPick(goodEligibleRoles);
      await tx
        .update(game_players)
        .set({ role_id: picked?.id ?? null })
        .where(eq(game_players.id, player.id));
    }

    // Unassigned players (no team yet) receive no role assignment.
    for (const player of unassigned) {
      await tx
        .update(game_players)
        .set({ role_id: null })
        .where(eq(game_players.id, player.id));
    }
  });

  const updated = await db
    .select()
    .from(game_players)
    .where(eq(game_players.game_id, id));

  return NextResponse.json({ success: true, data: { players: updated } });
}
