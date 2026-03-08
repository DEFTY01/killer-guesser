import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import {
  games,
  game_players,
  votes,
  users,
  roles,
  events,
} from "@/db/schema";
import { and, eq, sql, aliasedTable } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { handleKillerDefeated } from "@/lib/gameEnd";
import { z } from "zod";

// ── Zod schemas ───────────────────────────────────────────────────

const postBodySchema = z.object({
  targetId: z.number().int().positive(),
  day: z.number().int().positive(),
});

// ── Helpers ───────────────────────────────────────────────────────

/** Returns true when the current UTC time is inside the game's vote window. */
function isWindowOpen(
  windowStart: string | null,
  windowEnd: string | null,
): boolean {
  if (!windowStart || !windowEnd) return false;
  const now = Date.now();
  return now >= new Date(windowStart).getTime() && now <= new Date(windowEnd).getTime();
}

/**
 * Counts votes for a given game day, checks for a simple majority,
 * and applies the result (kill player or trigger killer-defeated end).
 * A "vote_result" event is inserted so this only runs once per day.
 */
async function processVoteResults(
  gameId: string,
  day: number,
): Promise<void> {
  // Guard: skip if already processed
  const [existing] = await db
    .select({ id: events.id })
    .from(events)
    .where(
      and(
        eq(events.game_id, gameId),
        eq(events.day, day),
        eq(events.type, "vote_result"),
      ),
    )
    .limit(1);

  if (existing) return;

  // Count alive players (total electorate)
  const [aliveRow] = await db
    .select({ count: sql<number>`count(*)` })
    .from(game_players)
    .where(
      and(eq(game_players.game_id, gameId), eq(game_players.is_dead, 0)),
    );
  const totalAlive = aliveRow?.count ?? 0;

  if (totalAlive === 0) return;

  // Count votes per target
  const voteCounts = await db
    .select({
      target_id: votes.target_id,
      count: sql<number>`count(*)`,
    })
    .from(votes)
    .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
    .groupBy(votes.target_id);

  // Simple majority: strictly more than half of living voters
  const threshold = Math.floor(totalAlive / 2) + 1;
  const majority = voteCounts.find((v) => v.count >= threshold);

  let outcome: "killer_defeated" | "killer_survived" | "no_majority" =
    "no_majority";
  let winnerId: number | null = null;

  if (majority) {
    winnerId = majority.target_id;

    // Determine if the voted-out player is the killer
    const [playerEntry] = await db
      .select({ role_id: game_players.role_id })
      .from(game_players)
      .where(
        and(
          eq(game_players.game_id, gameId),
          eq(game_players.user_id, majority.target_id),
        ),
      )
      .limit(1);

    let isKiller = false;
    if (playerEntry?.role_id) {
      const [role] = await db
        .select({ name: roles.name })
        .from(roles)
        .where(eq(roles.id, playerEntry.role_id))
        .limit(1);
      isKiller = role?.name === "Killer";
    }

    if (isKiller) {
      await handleKillerDefeated(gameId);
      outcome = "killer_defeated";
    } else {
      // Eliminate the voted-out player
      await db
        .update(game_players)
        .set({ is_dead: 1, died_at: Math.floor(Date.now() / 1000) })
        .where(
          and(
            eq(game_players.game_id, gameId),
            eq(game_players.user_id, majority.target_id),
          ),
        );
      outcome = "killer_survived";
    }
  }

  // Record the result event (also acts as idempotency guard)
  await db.insert(events).values({
    game_id: gameId,
    day,
    type: "vote_result",
    payload: JSON.stringify({ outcome, winner_id: winnerId }),
  });
}

// ── GET /api/game/[id]/vote?day=N ─────────────────────────────────

/**
 * GET /api/game/[id]/vote?day=N
 *
 * Returns the current voting state for the given game day.
 *
 * **Window open** – returns the list of alive players and the current day
 * number. Also includes `currentVote` (the caller's existing vote target, if
 * any) and `isSpy` (whether the caller has the `see_votes` permission).
 *
 * **Window closed** – returns anonymous vote tallies (count per player).
 * If the caller has the `see_votes` permission the response additionally
 * includes `voteList`: the full detail of who voted for whom. The `outcome`
 * field signals whether the killer was defeated, survived, or there was no
 * majority. Triggers vote-result processing the first time it is called after
 * the window closes.
 *
 * @param req - Incoming request. Query param `day` (integer ≥ 1) is required.
 * @param params.id - The game ID.
 * @returns JSON `{ success: true, data: VoteState }` or an error response.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: gameId } = await params;
  const dayParam = req.nextUrl.searchParams.get("day");
  const day = dayParam ? parseInt(dayParam, 10) : 1;

  if (isNaN(day) || day < 1) {
    return NextResponse.json(
      { success: false, error: "Invalid day parameter" },
      { status: 400 },
    );
  }

  // Fetch game
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, gameId))
    .limit(1);

  if (!game) {
    return NextResponse.json(
      { success: false, error: "Game not found" },
      { status: 404 },
    );
  }

  const callerId = parseInt(session.user.id, 10);

  // Resolve caller's role and permissions
  const [callerPlayer] = await db
    .select({ role_id: game_players.role_id, team: game_players.team })
    .from(game_players)
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, callerId),
      ),
    )
    .limit(1);

  let canSeeVotes = false;
  let isSpy = false;

  if (callerPlayer?.role_id) {
    const [callerRole] = await db
      .select({ permissions: roles.permissions })
      .from(roles)
      .where(eq(roles.id, callerPlayer.role_id))
      .limit(1);

    if (callerRole?.permissions) {
      const perms = JSON.parse(callerRole.permissions) as string[];
      canSeeVotes = perms.includes("see_votes");
      isSpy = canSeeVotes;
    }
  }

  const windowOpen = isWindowOpen(game.vote_window_start, game.vote_window_end);

  if (windowOpen) {
    // Return alive players for the voting grid
    const alivePlayers = await db
      .select({
        id: users.id,
        name: users.name,
        avatar_url: users.avatar_url,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(
        and(eq(game_players.game_id, gameId), eq(game_players.is_dead, 0)),
      );

    // Return caller's current vote (if any) so the UI can pre-select
    const [existingVote] = await db
      .select({ target_id: votes.target_id })
      .from(votes)
      .where(
        and(
          eq(votes.game_id, gameId),
          eq(votes.day, day),
          eq(votes.voter_id, callerId),
        ),
      )
      .limit(1);

    return NextResponse.json({
      success: true,
      data: {
        status: "open",
        day,
        players: alivePlayers,
        currentVote: existingVote?.target_id ?? null,
        isSpy,
      },
    });
  }

  // Window is closed — process results if not yet done
  await processVoteResults(gameId, day);

  // Anonymous vote tallies (with player names for the UI)
  const voteCounts = await db
    .select({
      target_id: votes.target_id,
      target_name: users.name,
      target_avatar: users.avatar_url,
      count: sql<number>`count(*)`,
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(and(eq(votes.game_id, gameId), eq(votes.day, day)))
    .groupBy(votes.target_id, users.name, users.avatar_url);

  // Retrieve the outcome recorded by processVoteResults
  const [resultEvent] = await db
    .select({ payload: events.payload })
    .from(events)
    .where(
      and(
        eq(events.game_id, gameId),
        eq(events.day, day),
        eq(events.type, "vote_result"),
      ),
    )
    .limit(1);

  const outcome = resultEvent?.payload
    ? (
        JSON.parse(resultEvent.payload) as {
          outcome: string;
          winner_id: number | null;
        }
      ).outcome
    : null;

  interface ResponseData {
    status: string;
    day: number;
    voteCounts: typeof voteCounts;
    outcome: string | null;
    callerTeam: string | null;
    voteList?: {
      voter_id: number;
      voter_name: string;
      voter_avatar: string | null;
      target_id: number;
      target_name: string;
      target_avatar: string | null;
    }[];
  }

  const data: ResponseData = {
    status: "closed",
    day,
    voteCounts,
    outcome,
    callerTeam: callerPlayer?.team ?? null,
  };

  // Spy role: include the detailed vote list
  if (canSeeVotes) {
    const voter = aliasedTable(users, "voter");
    const target = aliasedTable(users, "target");

    const voteList = await db
      .select({
        voter_id: votes.voter_id,
        voter_name: voter.name,
        voter_avatar: voter.avatar_url,
        target_id: votes.target_id,
        target_name: target.name,
        target_avatar: target.avatar_url,
      })
      .from(votes)
      .innerJoin(voter, eq(votes.voter_id, voter.id))
      .innerJoin(target, eq(votes.target_id, target.id))
      .where(and(eq(votes.game_id, gameId), eq(votes.day, day)));

    data.voteList = voteList;
  }

  return NextResponse.json({ success: true, data });
}

// ── POST /api/game/[id]/vote ──────────────────────────────────────

/**
 * POST /api/game/[id]/vote
 *
 * Submits or updates the caller's vote for the given game day.
 *
 * A player may vote only once per day, but may change their vote freely
 * while the vote window is open (upsert logic). The killer is allowed to
 * vote. Voting outside the window returns 403.
 *
 * @param req - Request body: `{ targetId: number, day: number }`.
 * @param params.id - The game ID.
 * @returns `{ success: true }` on success, or an error response.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  const { id: gameId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = postBodySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "targetId and day are required positive integers" },
      { status: 422 },
    );
  }

  const { targetId, day } = parsed.data;
  const callerId = parseInt(session.user.id, 10);

  // Fetch game to verify vote window
  const [game] = await db
    .select({
      vote_window_start: games.vote_window_start,
      vote_window_end: games.vote_window_end,
      status: games.status,
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

  if (!isWindowOpen(game.vote_window_start, game.vote_window_end)) {
    return NextResponse.json(
      { success: false, error: "Voting window is not open" },
      { status: 403 },
    );
  }

  // Verify caller is alive in this game
  const [callerPlayer] = await db
    .select({ is_dead: game_players.is_dead })
    .from(game_players)
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, callerId),
      ),
    )
    .limit(1);

  if (!callerPlayer) {
    return NextResponse.json(
      { success: false, error: "You are not in this game" },
      { status: 403 },
    );
  }

  if (callerPlayer.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "Dead players cannot vote" },
      { status: 403 },
    );
  }

  // Verify target exists and is alive in this game
  const [targetPlayer] = await db
    .select({ is_dead: game_players.is_dead })
    .from(game_players)
    .where(
      and(
        eq(game_players.game_id, gameId),
        eq(game_players.user_id, targetId),
      ),
    )
    .limit(1);

  if (!targetPlayer || targetPlayer.is_dead === 1) {
    return NextResponse.json(
      { success: false, error: "Invalid vote target" },
      { status: 422 },
    );
  }

  // Upsert: update existing vote or insert a new one
  const [existingVote] = await db
    .select({ id: votes.id })
    .from(votes)
    .where(
      and(
        eq(votes.game_id, gameId),
        eq(votes.day, day),
        eq(votes.voter_id, callerId),
      ),
    )
    .limit(1);

  if (existingVote) {
    await db
      .update(votes)
      .set({ target_id: targetId })
      .where(eq(votes.id, existingVote.id));
  } else {
    await db.insert(votes).values({
      game_id: gameId,
      day,
      voter_id: callerId,
      target_id: targetId,
    });
  }

  return NextResponse.json({ success: true });
}
