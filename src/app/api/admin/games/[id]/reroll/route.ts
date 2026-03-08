import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { games, game_players, roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

// ── Helpers ───────────────────────────────────────────────────────

/** Shuffles an array in place using Fisher-Yates. */
function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

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
 * - `teams` — Randomly splits all players into two equal (or near-equal) halves,
 *   assigning "team1" or "team2" respectively (Fisher-Yates shuffle).
 * - `roles` — Assigns each player a role via weighted random selection based on
 *   `roles.chance_percent`. Only roles whose `team` field matches the player's
 *   team (or is `"any"`) are considered. Players without a team receive roles
 *   eligible for `"any"`.
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

  // Verify game exists.
  const [game] = await db
    .select({ id: games.id })
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

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
    // Random 50/50 split.
    const shuffled = shuffle([...players]);
    const half = Math.ceil(shuffled.length / 2);

    await db.transaction(async (tx) => {
      for (let i = 0; i < shuffled.length; i++) {
        const team = i < half ? "team1" : "team2";
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

  // type === "roles": weighted random assignment per player.
  const allRoles = await db.select().from(roles);

  if (allRoles.length === 0) {
    return NextResponse.json(
      { success: false, error: "No roles configured" },
      { status: 422 },
    );
  }

  await db.transaction(async (tx) => {
    for (const player of players) {
      // Determine eligible roles for this player's team.
      const eligible = allRoles
        .filter(
          (r) =>
            r.team === "any" ||
            r.team === player.team ||
            player.team === null,
        )
        .map((r) => ({ ...r, weight: r.chance_percent }));

      const picked = weightedPick(eligible);
      await tx
        .update(game_players)
        .set({ role_id: picked?.id ?? null })
        .where(eq(game_players.id, player.id));
    }
  });

  const updated = await db
    .select()
    .from(game_players)
    .where(eq(game_players.game_id, id));

  return NextResponse.json({ success: true, data: { players: updated } });
}
