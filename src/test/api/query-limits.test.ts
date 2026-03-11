import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * query-limits.test.ts
 *
 * Verifies that unbounded SELECTs are capped by explicit .limit() calls.
 * Seeds 60 players into the mock DB and asserts that the board / vote
 * endpoints return at most 50 player records.
 */

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockIsVoteWindowOpen, mockResolveVoteWindow } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockIsVoteWindowOpen: vi.fn().mockReturnValue(false),
  mockResolveVoteWindow: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/voteWindow", () => ({
  resolveVoteWindow: mockResolveVoteWindow,
  isVoteWindowOpen: mockIsVoteWindowOpen,
}));
vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn() })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed", game_ended: "game_ended", player_died: "player_died" },
}));
vi.mock("@/lib/gameEnd", () => ({ checkGameOver: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/activateGame", () => ({ activateGameIfReady: vi.fn() }));
vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
}));
vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
  gt: vi.fn(),
  lte: vi.fn(),
  desc: vi.fn(),
  asc: vi.fn(),
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", avatar_url: "avatar_url" },
  roles: { id: "id", name: "name", color_hex: "color_hex", permissions: "permissions", description: "description" },
  games: { id: "id", name: "name", status: "status", start_time: "st", team1_name: "t1", team2_name: "t2", vote_window_start: "vws", vote_window_end: "vwe", evil_team_is_team1: "eti1" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", team: "team", is_dead: "dead", is_revived: "is_revived", revived_at: "ra", role_id: "rid", has_tipped: "ht" },
  game_settings: { game_id: "gid", murder_item_url: "miu", murder_item_name: "min" },
  votes: { id: "id", game_id: "gid", day: "day", voter_id: "vid", target_id: "tid" },
  events: { id: "id" },
  vote_window_overrides: { id: "id", game_id: "game_id", day_date: "day_date", window_start: "window_start", window_end: "window_end" },
}));

// ── Helpers ───────────────────────────────────────────────────────

/** Generate an array of N mock player records. */
function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    user_id: i + 1,
    name: `Player${i + 1}`,
    avatar_url: null,
    is_dead: 0,
    is_revived: 0,
    revived_at: null,
    role_color: "#2E6DA4",
  }));
}

// ── DB mock that enforces limits ──────────────────────────────────
// The mock intercepts .limit(N) calls and slices the seeded result set to N
// rows, simulating what a real DB would do.

const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  callIndex: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const fullResult = dbState.selectResults[dbState.callIndex] ?? [];
      dbState.callIndex++;

      // limit() enforces the row cap — slices to the requested number.
      const makeLimit = (data: unknown[]) =>
        vi.fn((n: number) => Promise.resolve(data.slice(0, n)));

      const limit = makeLimit(fullResult);
      const orderByLimit = makeLimit(fullResult);
      const orderBy = vi.fn(() => Object.assign(Promise.resolve(fullResult), { limit: orderByLimit }));
      const groupByInner = {
        orderBy: vi.fn(() => Object.assign(Promise.resolve(fullResult), { limit: makeLimit(fullResult) })),
        limit: makeLimit(fullResult),
      };
      const groupBy = vi.fn(() => groupByInner);

      const where = vi.fn(() => {
        const p = Promise.resolve(fullResult);
        return Object.assign(p, { limit, orderBy, groupBy, returning: vi.fn().mockResolvedValue(fullResult) });
      });
      const leftJoin = vi.fn(() => ({ where, orderBy }));
      const innerJoin = vi.fn(() => ({ where, leftJoin, orderBy, groupBy }));
      const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy, groupBy }));
      return { from };
    }),
    insert: vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Object.assign(Promise.resolve([]), { returning: vi.fn().mockResolvedValue([]) })) })) })),
    transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txUpdate = vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]) })) }));
      return fn({ update: txUpdate });
    }),
  },
}));

// ── Imports ───────────────────────────────────────────────────────

import { GET as getBoard } from "@/app/api/game/[id]/board/route";
import { GET as getVote } from "@/app/api/game/[id]/vote/route";

// ── Tests ─────────────────────────────────────────────────────────

describe("query-limits: board endpoint caps players at 50", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    // Seed 60 players to verify the cap
    dbState.selectResults = [];
  });

  it("returns at most 50 players even when 60 are seeded in the DB", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "player" } });

    const sixtyPlayers = makePlayers(60);

    dbState.selectResults = [
      // 1. Game lookup
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row
      [{ game_player_id: 1, permissions: null, role_name: "Villager", role_color: null, role_description: null, team: "team1", is_dead: 0, revived_at: null, has_tipped: 0 }],
      // 4. Players — 60 rows seeded; mock DB enforces .limit(50)
      sixtyPlayers,
    ];

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // The board API applies .limit(50), so at most 50 players are returned
    expect(data.data.players.length).toBeLessThanOrEqual(50);
  });
});

describe("query-limits: vote endpoint caps players at 50", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    mockIsVoteWindowOpen.mockReturnValue(false);
    mockResolveVoteWindow.mockResolvedValue(null);
  });

  it("returns at most 50 players in the vote tally even when 60 are seeded", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    const sixtyPlayers = makePlayers(60).map((p) => ({ id: p.user_id, name: p.name, is_dead: 0, revived_at: null }));

    dbState.selectResults = [
      // 1. Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil", timezone: "UTC" }],
      // 2. Caller
      [{ game_player_id: 1, permissions: null, is_dead: 0, revived_at: null }],
      // 3. Players — 60 rows; mock DB enforces .limit(50)
      sixtyPlayers,
      // 4. Tally (vote counts per player)
      [],
      // 5. Existing vote check
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // The vote API applies .limit(50) to the players query
    expect(data.data.players.length).toBeLessThanOrEqual(50);
  });
});
