import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { game_players, games, roles, users, votes } from "@/db/schema";
import { and, count, eq } from "drizzle-orm";
import { ablyServer, ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { closeRound, findEliminated, loadResults, parsePermissions } from "@/lib/voteClose";
import { getVotingState } from "@/lib/votingState";
import type { Round } from "@/lib/voteRound";

// ── Helpers ────────────────────────────────────────────────────────

const noStore = { headers: { "Cache-Control": "no-store" } };

function bounds(round: Round | null) {
  return round
    ? { window_open_utc_ms: round.openMs, window_close_utc_ms: round.closeMs }
    : {};
}

/** Who voted for whom in one round, with names. For callers with `see_votes`. */
async function loadVoteDetails(gameId: string, day: number) {
  const [enriched, nameRows] = await Promise.all([
    db
      .select({
        voter_id: votes.voter_id,
        voter_name: users.name,
        target_id: votes.target_id,
      })
      .from(votes)
      .innerJoin(users, eq(votes.voter_id, users.id))
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
      .limit(200),
    db
      .select({ user_id: game_players.user_id, name: users.name })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(eq(game_players.game_id, gameId))
      .limit(50),
  ]);
  const names = new Map(nameRows.map((p) => [p.user_id, p.name]));
  return enriched.map((v) => ({
    voterId: v.voter_id,
    voterName: v.voter_name,
    targetId: v.target_id,
    targetName: names.get(v.target_id) ?? "Unknown",
  }));
}

// ── GET /api/game/[id]/vote ───────────────────────────────────────

/**
 * Returns the vote state for the current round.
 *
 * **Round open:** `{ windowOpen: true, day, players[], callerVotedFor, ... }`
 *
 * **Round closed or not yet open:** `{ windowOpen: false, day, results[],
 * eliminated }`. Before today's window opens only the opening time is
 * returned; afterwards the last finished round's results are shown.
 *
 * Callers with `see_votes` additionally get the voter → target breakdown.
 *
 * **Lazy close:** the first request after a round ends tallies it, applies the
 * strict-majority rule over living voters and publishes `vote_closed`.
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

  const [game] = await db
    .select({
      id: games.id,
      status: games.status,
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      timezone: games.timezone,
      vote_closed_day: games.vote_closed_day,
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

  const [callerRow] = await db
    .select({
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
  const canSeeVotes = callerPermissions.includes("see_votes");

  const state = await getVotingState(game);
  const base = { callerUserId: userId, game_timezone: game.timezone };

  // ── Round open ────────────────────────────────────────────────
  if (state.open) {
    const day = state.open.number;

    const [players, tally, [existingVote]] = await Promise.all([
      db
        .select({
          id: game_players.user_id,
          name: users.name,
          is_dead: game_players.is_dead,
        })
        .from(game_players)
        .innerJoin(users, eq(game_players.user_id, users.id))
        .where(eq(game_players.game_id, gameId))
        .orderBy(users.name)
        .limit(50),
      db
        .select({ target_id: votes.target_id, vote_count: count(votes.id) })
        .from(votes)
        .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
        .groupBy(votes.target_id)
        .limit(200),
      db
        .select({ target_id: votes.target_id })
        .from(votes)
        .where(
          and(
            eq(votes.game_id, gameId),
            eq(votes.day, day),
            eq(votes.voter_id, userId),
          ),
        )
        .limit(1),
    ]);

    const tallyMap = new Map(tally.map((r) => [r.target_id, r.vote_count]));
    const responseData: Record<string, unknown> = {
      ...base,
      windowOpen: true,
      day,
      canVote: !callerPermissions.includes("see_killer"),
      ...bounds(state.open),
      callerVotedFor: existingVote?.target_id ?? null,
      players: players
        .filter((p) => p.is_dead === 0)
        .map((p) => ({ id: p.id, name: p.name, voteCount: tallyMap.get(p.id) ?? 0 })),
    };
    if (canSeeVotes) responseData.votes = await loadVoteDetails(gameId, day);

    return NextResponse.json({ success: true, data: responseData }, noStore);
  }

  // ── Round closed: tally the finished round once ───────────────
  let eliminated: { id: number; name: string } | null | undefined;
  if (state.last && game.status === "active" && state.last.number > game.vote_closed_day) {
    // Close every missed round in order (nobody may have polled while an
    // earlier one ended); only the newest is announced to clients.
    let closedLast: Awaited<ReturnType<typeof closeRound>>;
    const first = Math.max(game.vote_closed_day + 1, state.last.number - 6);
    for (let n = first; n <= state.last.number; n++) {
      const isLast = n === state.last.number;
      const closed = await closeRound(gameId, { number: n }, { announce: isLast });
      if (isLast) closedLast = closed;
    }
    eliminated = closedLast ? closedLast.eliminated : await findEliminated(gameId, state.last);
  } else if (state.last) {
    eliminated = await findEliminated(gameId, state.last);
  }

  // Before today's window opens there is nothing to show but the opening time.
  const beforeWindow =
    state.upcoming !== null && state.upcoming.number === state.currentNumber;
  const shown = beforeWindow ? state.upcoming : state.last;
  const day = shown?.number ?? state.currentNumber;

  const responseData: Record<string, unknown> = {
    ...base,
    windowOpen: false,
    day,
    ...bounds(shown),
    results: beforeWindow || !shown ? [] : await loadResults(gameId, day),
    ...(eliminated !== undefined && !beforeWindow ? { eliminated } : {}),
  };
  if (canSeeVotes && shown && !beforeWindow) {
    responseData.votes = await loadVoteDetails(gameId, day);
  }

  return NextResponse.json({ success: true, data: responseData }, noStore);
}

// ── POST /api/game/[id]/vote ──────────────────────────────────────

const voteSchema = z.object({
  targetId: z.number().int().positive(),
});

/**
 * Submits or changes the caller's vote in the open round.
 *
 * - Game must be active and a vote round must be open.
 * - Caller must be a living participant without killer knowledge.
 * - Target must be a living participant (voting for yourself is allowed).
 * - Upserts, so a vote can be changed until the round closes.
 * - Publishes a `vote_cast` event on the round's channel.
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

  const [game] = await db
    .select({
      id: games.id,
      status: games.status,
      start_time: games.start_time,
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      timezone: games.timezone,
      vote_closed_day: games.vote_closed_day,
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

  if (game.status !== "active") {
    return NextResponse.json(
      { success: false, error: "Game is not active" },
      { status: 403 },
    );
  }

  const { open } = await getVotingState(game);
  if (!open) {
    return NextResponse.json(
      { success: false, error: "Voting is closed" },
      { status: 403 },
    );
  }
  const day = open.number;

  const [callerPlayer] = await db
    .select({
      id: game_players.id,
      is_dead: game_players.is_dead,
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
  if (parsePermissions(callerPlayer.permissions).includes("see_killer")) {
    return NextResponse.json(
      { success: false, error: "Players with killer knowledge cannot vote" },
      { status: 403 },
    );
  }

  const [targetPlayer] = await db
    .select({ id: game_players.id })
    .from(game_players)
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, targetId),
        eq(game_players.is_dead, 0),
      ),
    )
    .limit(1);

  if (!targetPlayer) {
    return NextResponse.json(
      { success: false, error: "Target is not an alive participant" },
      { status: 422 },
    );
  }

  // Atomic upsert on the unique (game_id, day, voter_id) constraint.
  await db
    .insert(votes)
    .values({ game_id: gameId, day, voter_id: userId, target_id: targetId })
    .onConflictDoUpdate({
      target: [votes.game_id, votes.day, votes.voter_id],
      set: { target_id: targetId },
    });

  // The round may have been tallied between our open-check and the insert; a
  // vote that missed the tally must not be acknowledged as counted.
  const [{ vote_closed_day } = { vote_closed_day: 0 }] = await db
    .select({ vote_closed_day: games.vote_closed_day })
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);
  if (vote_closed_day >= day) {
    await db
      .delete(votes)
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day), eq(votes.voter_id, userId)));
    return NextResponse.json(
      { success: false, error: "Voting is closed" },
      { status: 403 },
    );
  }

  const [[voterUser], [targetUser]] = await Promise.all([
    db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1),
    db.select({ name: users.name }).from(users).where(eq(users.id, targetId)).limit(1),
  ]);

  if (process.env.ABLY_API_KEY) {
    // One event per vote: collapsing votes would drop every voter but the last.
    const channel = ablyServer.channels.get(ABLY_CHANNELS.vote(gameId, day));
    channel
      .publish(ABLY_EVENTS.vote_cast, {
        voterId: userId,
        voterName: voterUser?.name ?? "Unknown",
        targetId,
        targetName: targetUser?.name ?? "Unknown",
      })
      .catch((err: unknown) => {
        console.error("[vote] VOTE_CAST publish failed:", err);
      });
  }

  return NextResponse.json({ success: true });
}
