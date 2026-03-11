import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, games, roles, users, votes } from "@/db/schema";
import { and, count, eq, sql } from "drizzle-orm";
import type { RolePermission } from "@/lib/role-constants";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { checkGameOver } from "@/lib/gameEnd";
import { nowInZone, windowBoundariesUtc } from "@/lib/timezone";
import { resolveVoteWindow, isVoteWindowOpen } from "@/lib/voteWindow";

// ── Server-side Ably debounce ─────────────────────────────────────
// When multiple clients vote within a short window (e.g. 3 phones tapping at
// once) we would otherwise fire a separate VOTE_CAST publish for each.  The
// 500 ms debounce collapses those into a single message per game/day,
// significantly reducing Ably message volume.
const voteCastDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();

function debounceVoteCast(key: string, callback: () => void): void {
  const existing = voteCastDebounceTimers.get(key);
  if (existing !== undefined) clearTimeout(existing);
  const timer = setTimeout(() => {
    voteCastDebounceTimers.delete(key);
    callback();
  }, 500);
  voteCastDebounceTimers.set(key, timer);
}

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

/**
 * Returns true if the current time in the game's timezone is within the
 * [start, end) vote window.  HH:MM strings are interpreted in game.timezone.
 */
function isWindowOpen(
  start: string | null,
  end: string | null,
  timezone: string,
): boolean {
  if (!start || !end) return false;
  const currentMin = nowInZone(timezone);
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Handle overnight windows (e.g. 22:00–02:00)
  if (endMin <= startMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
}

/**
 * Returns true if the current time in the game's timezone is at or past
 * vote_window_end and the window is no longer open.
 */
function isWindowEnded(end: string | null, timezone: string): boolean {
  if (!end) return false;
  const currentMin = nowInZone(timezone);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(eh) || isNaN(em)) return false;
  return currentMin >= eh * 60 + em;
}

// ── GET /api/game/[id]/vote ───────────────────────────────────────

/**
 * Returns the current vote state for the active day.
 *
 * Compares the server's current UTC time (HH:MM) against the game's
 * `vote_window_start` / `vote_window_end` fields to determine state:
 *
 * **Window open:**
 * ```json
 * { windowOpen: true, day: 1, players: [{ id, name, avatarUrl }] }
 * ```
 *
 * **Window closed / not yet started:**
 * ```json
 * { windowOpen: false, day: 1, results: [{ playerId, name, voteCount }] }
 * ```
 *
 * Callers with the `see_votes` permission additionally receive a `votes` array
 * with the full voter → target breakdown in both states.
 *
 * **Lazy close** — on the first GET received after `vote_window_end` the
 * endpoint automatically tallies votes, applies a simple-majority elimination
 * (> 50 % of living voters), and publishes a `VOTE_CLOSED` Ably event on the
 * `game-[id]` channel.  The vote window is then cleared to prevent
 * re-processing on subsequent requests.
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
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      timezone: games.timezone,
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
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
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
  const canSeeVotes = callerPermissions.includes("see_votes");

  // ── Compute current day ───────────────────────────────────────
  const nowUnix = Math.floor(Date.now() / 1000);
  const day = Math.max(
    1,
    Math.floor((nowUnix - game.start_time) / 86400) + 1,
  );

  const { vote_window_start, vote_window_end, timezone } = game;

  // ── Resolve effective vote window (override or default) ──────
  const todayDate = new Date().toISOString().slice(0, 10);
  const resolvedWindow = await resolveVoteWindow(gameId, todayDate);

  // ── Lazy close: process if window has ended ──────────────────
  if (
    vote_window_start &&
    vote_window_end &&
    isWindowEnded(vote_window_end, timezone) &&
    !isWindowOpen(vote_window_start, vote_window_end, timezone)
  ) {
    // Atomically clear the window to prevent concurrent re-processing.
    const [cleared] = await db
      .update(games)
      .set({ vote_window_start: null, vote_window_end: null })
      .where(
        and(
          eq(games.id, gameId),
          eq(games.vote_window_start, vote_window_start),
        ),
      )
      .returning({ id: games.id });

    // Only the first caller that cleared the window performs close logic.
    if (cleared) {
      // Tally votes for the current day.
      const tally = await db
        .select({
          target_id: votes.target_id,
          target_name: users.name,
          vote_count: count(votes.id),
        })
        .from(votes)
        .innerJoin(users, eq(votes.target_id, users.id))
        .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
        .groupBy(votes.target_id, users.name);

      // Build a Map of vote counts for O(1) lookups and total-vote calculation.
      const counts = new Map(tally.map((r) => [r.target_id, r.vote_count]));
      const totalVotes = [...counts.values()].reduce((s, c) => s + c, 0);

      // Sort descending by vote count.
      const sorted = [...tally].sort((a, b) => b.vote_count - a.vote_count);
      const top = sorted[0];

      // A player is eliminated only when their count is STRICTLY GREATER than
      // all other candidates AND strictly greater than half of total votes cast
      // (i.e. vote_count > 50%, so vote_count * 2 > totalVotes).
      const isStrictlyTop =
        top !== undefined &&
        (sorted.length < 2 || sorted[1].vote_count < top.vote_count);
      const hasMajority =
        top !== undefined && totalVotes > 0 && top.vote_count * 2 > totalVotes;
      const majority = isStrictlyTop && hasMajority ? top : undefined;

      let eliminated: { id: number; name: string } | null = null;

      if (majority) {
        // Eliminate the majority player (died in the evening).
        await db
          .update(game_players)
          .set({
            is_dead: 1,
            died_at: sql<number>`(unixepoch())`,
            died_time_of_day: "evening",
          })
          .where(
            and(
              eq(game_players.game_id, gameId),
              eq(game_players.user_id, majority.target_id),
            ),
          );

        eliminated = { id: majority.target_id, name: majority.target_name };

        // Check win conditions after vote elimination (multi-killer rule:
        // good wins only when ALL evil players are dead).
        await checkGameOver(gameId);
      }

      // Publish VOTE_CLOSED on the game channel.
      if (process.env.ABLY_API_KEY) {
        const channel = ablyServer.channels.get(ABLY_CHANNELS.game(gameId));
        await channel.publish(ABLY_EVENTS.vote_closed, {
          eliminated,
          voteResults: tally.map((r) => ({
            playerId: r.target_id,
            name: r.target_name,
            voteCount: r.vote_count,
          })),
        });
      }
    }

    // Reload game to get cleared vote_window values.
    const [reloaded] = await db
      .select({ vote_window_start: games.vote_window_start, vote_window_end: games.vote_window_end })
      .from(games)
      .where(eq(games.id, gameId))
      .limit(1);

    // Build results response.
    const tally = await db
      .select({
        target_id: votes.target_id,
        target_name: users.name,
        vote_count: count(votes.id),
      })
      .from(votes)
      .innerJoin(users, eq(votes.target_id, users.id))
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
      .groupBy(votes.target_id, users.name);

    const results = tally.map((r) => ({
      playerId: r.target_id,
      name: r.target_name,
      voteCount: r.vote_count,
    }));

    // Find who (if anyone) was eliminated in the evening for today's day.
    // This covers both the first-caller and subsequent GET calls after close.
    const eveningDead = await db
      .select({ user_id: game_players.user_id, name: users.name })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(
        and(
          eq(game_players.game_id, gameId),
          eq(game_players.is_dead, 1),
          eq(game_players.died_time_of_day, "evening"),
        ),
      )
      .limit(1);
    const eliminatedFromDb = eveningDead[0]
      ? { id: eveningDead[0].user_id, name: eveningDead[0].name }
      : null;

    const responseData: Record<string, unknown> = {
      windowOpen: false,
      day,
      callerUserId: userId,
      eliminated: eliminatedFromDb,
      results,
      game_timezone: timezone,
      ...(reloaded?.vote_window_start && reloaded?.vote_window_end
        ? {
            window_open_utc_ms: windowBoundariesUtc(reloaded.vote_window_start, reloaded.vote_window_end, timezone).openMs,
            window_close_utc_ms: windowBoundariesUtc(reloaded.vote_window_start, reloaded.vote_window_end, timezone).closeMs,
          }
        : {}),
    };

    if (canSeeVotes) {
      const enriched = await db
        .select({
          voter_id: votes.voter_id,
          voter_name: users.name,
          target_id: votes.target_id,
        })
        .from(votes)
        .innerJoin(users, eq(votes.voter_id, users.id))
        .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
        .limit(200);

      const playerMap = new Map(
        (await db
          .select({ user_id: game_players.user_id, name: users.name })
          .from(game_players)
          .innerJoin(users, eq(game_players.user_id, users.id))
          .where(eq(game_players.game_id, gameId))
          .limit(50)).map((p) => [p.user_id, p]),
      );

      responseData.votes = enriched.map((v) => ({
        voterId: v.voter_id,
        voterName: v.voter_name,
        targetId: v.target_id,
        targetName: playerMap.get(v.target_id)?.name ?? "Unknown",
      }));
    }

    return NextResponse.json({ success: true, data: responseData });
  }

  // ── Window open: return alive players ────────────────────────
  if (isVoteWindowOpen(resolvedWindow, timezone)) {
    const players = await db
      .select({
        id: game_players.user_id,
        name: users.name,
        is_dead: game_players.is_dead,
        revived_at: game_players.revived_at,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(eq(game_players.game_id, gameId))
      .orderBy(users.name)
      .limit(50);

    const alivePlayers = players.filter(
      (p) => p.is_dead === 0,
    );

    // Aggregate vote tallies for live display.
    const tally = await db
      .select({
        target_id: votes.target_id,
        vote_count: count(votes.id),
      })
      .from(votes)
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
      .groupBy(votes.target_id)
      .limit(200);

    const tallyMap = new Map(tally.map((r) => [r.target_id, r.vote_count]));

    // Check if caller has already voted.
    const [existingVote] = await db
      .select({ target_id: votes.target_id })
      .from(votes)
      .where(
        and(
          eq(votes.game_id, gameId),
          eq(votes.day, day),
          eq(votes.voter_id, userId),
        ),
      )
      .limit(1);

    const canVote = !callerPermissions.includes("see_killer");

    const windowBounds =
      resolvedWindow
        ? windowBoundariesUtc(resolvedWindow.start, resolvedWindow.end, timezone)
        : null;

    const responseData: Record<string, unknown> = {
      windowOpen: true,
      day,
      callerUserId: userId,
      canVote,
      game_timezone: timezone,
      ...(windowBounds
        ? {
            window_open_utc_ms: windowBounds.openMs,
            window_close_utc_ms: windowBounds.closeMs,
          }
        : {}),
      callerVotedFor: existingVote?.target_id ?? null,
      players: alivePlayers.map((p) => ({
        id: p.id,
        name: p.name,
        voteCount: tallyMap.get(p.id) ?? 0,
      })),
    };

    if (canSeeVotes) {
      const enriched = await db
        .select({
          voter_id: votes.voter_id,
          voter_name: users.name,
          target_id: votes.target_id,
        })
        .from(votes)
        .innerJoin(users, eq(votes.voter_id, users.id))
        .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
        .limit(200);

      const playerMap = new Map(
        alivePlayers.map((p) => [p.id, p]),
      );

      responseData.votes = enriched.map((v) => ({
        voterId: v.voter_id,
        voterName: v.voter_name,
        targetId: v.target_id,
        targetName: playerMap.get(v.target_id)?.name ?? "Unknown",
      }));
    }

    return NextResponse.json({ success: true, data: responseData });
  }

  // ── Window not yet open or no window set ─────────────────────
  const tally = await db
    .select({
      target_id: votes.target_id,
      target_name: users.name,
      vote_count: count(votes.id),
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
    .groupBy(votes.target_id, users.name)
    .limit(200);

  const results = tally.map((r) => ({
    playerId: r.target_id,
    name: r.target_name,
    voteCount: r.vote_count,
  }));

  const notYetOpenBounds =
    resolvedWindow
      ? windowBoundariesUtc(resolvedWindow.start, resolvedWindow.end, timezone)
      : null;

  const responseData: Record<string, unknown> = {
    windowOpen: false,
    day,
    callerUserId: userId,
    game_timezone: timezone,
    ...(notYetOpenBounds
      ? {
          window_open_utc_ms: notYetOpenBounds.openMs,
          window_close_utc_ms: notYetOpenBounds.closeMs,
        }
      : {}),
    results,
  };

  if (canSeeVotes) {
    const enriched = await db
      .select({
        voter_id: votes.voter_id,
        voter_name: users.name,
        target_id: votes.target_id,
      })
      .from(votes)
      .innerJoin(users, eq(votes.voter_id, users.id))
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
      .limit(200);

    const playerMap = new Map(
      (await db
        .select({ user_id: game_players.user_id, name: users.name })
        .from(game_players)
        .innerJoin(users, eq(game_players.user_id, users.id))
        .where(eq(game_players.game_id, gameId))
        .limit(50)).map((p) => [p.user_id, p]),
    );

    responseData.votes = enriched.map((v) => ({
      voterId: v.voter_id,
      voterName: v.voter_name,
      targetId: v.target_id,
      targetName: playerMap.get(v.target_id)?.name ?? "Unknown",
    }));
  }

  return NextResponse.json({ success: true, data: responseData });
}

// ── POST /api/game/[id]/vote ──────────────────────────────────────

const voteSchema = z.object({
  targetId: z.number().int().positive(),
});

/**
 * Submits or changes a vote for the current game day.
 *
 * - Caller must be a participant and alive (not dead without revival).
 * - The vote window must be currently open (UTC HH:MM comparison).
 * - Upserts: if the caller has already voted today the existing row is updated
 *   (allowing vote changes), otherwise a new row is inserted.
 * - Publishes a `VOTE_CAST` Ably event on the `vote-[gameId]-[day]` channel.
 *
 * @returns `{ success: true }` or `{ success: false; error: string }`
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

  const { targetId } = parsed.data;

  // ── Load game ─────────────────────────────────────────────────
  const [game] = await db
    .select({
      id: games.id,
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      timezone: games.timezone,
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

  // ── Check vote window is open ─────────────────────────────────
  const todayDatePost = new Date().toISOString().slice(0, 10);
  const resolvedWindowPost = await resolveVoteWindow(gameId, todayDatePost);
  if (!isVoteWindowOpen(resolvedWindowPost, game.timezone)) {
    return NextResponse.json(
      { success: false, error: "Voting is closed" },
      { status: 403 },
    );
  }

  // ── Verify caller is alive participant ────────────────────────
  const [callerPlayer] = await db
    .select({
      id: game_players.id,
      is_dead: game_players.is_dead,
      revived_at: game_players.revived_at,
      permissions: roles.permissions,
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

  if (callerPlayer.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "Dead players cannot vote" },
      { status: 403 },
    );
  }

  // Players who can see the killer's identity are observers -- they may not
  // cast a vote (they already know the answer and would spoil the game).
  const postCallerPerms = parsePermissions(callerPlayer.permissions);
  if (postCallerPerms.includes("see_killer")) {
    return NextResponse.json(
      { success: false, error: "Players with killer knowledge cannot vote" },
      { status: 403 },
    );
  }

  // ── Compute current day ───────────────────────────────────────
  const nowUnix = Math.floor(Date.now() / 1000);
  const day = Math.max(
    1,
    Math.floor((nowUnix - game.start_time) / 86400) + 1,
  );

  // ── Upsert vote (atomic: ON CONFLICT DO UPDATE) ──────────────
  // Relies on the unique constraint votes_game_day_voter_unique
  // (game_id, day, voter_id). Atomic — no TOCTOU race condition.
  await db
    .insert(votes)
    .values({ game_id: gameId, day, voter_id: userId, target_id: targetId })
    .onConflictDoUpdate({
      target: [votes.game_id, votes.day, votes.voter_id],
      set: { target_id: targetId },
    });

  // ── Load voter and target names for Ably payload ──────────────
  const [[voterUser], [targetUser]] = await Promise.all([
    db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1),
    db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, targetId))
      .limit(1),
  ]);

  // ── Publish VOTE_CAST (debounced) ─────────────────────────────
  // Debouncing collapses rapid bursts from multiple concurrent voters into a
  // single Ably message per game/day, preventing message storms.
  if (process.env.ABLY_API_KEY) {
    const debounceKey = `${gameId}:${day}`;
    const voterName = voterUser?.name ?? "Unknown";
    const targetName = targetUser?.name ?? "Unknown";
    debounceVoteCast(debounceKey, () => {
      const channel = ablyServer.channels.get(ABLY_CHANNELS.vote(gameId, day));
      channel.publish(ABLY_EVENTS.vote_cast, {
        voterId: userId,
        voterName,
        targetId,
        targetName,
      }).catch((err: unknown) => {
        console.error("[vote] VOTE_CAST publish failed:", err);
      });
    });
  }

  return NextResponse.json({ success: true });
}
