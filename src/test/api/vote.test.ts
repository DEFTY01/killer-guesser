import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockGetVotingState, mockCheckGameOver, mockPublish, dbState } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockGetVotingState: vi.fn(),
  mockCheckGameOver: vi.fn().mockResolvedValue(undefined),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  dbState: {
    selectResults: [] as unknown[][],
    callIndex: 0,
    claimResult: [{ id: "G1" }] as unknown[],
    setCalls: [] as Record<string, unknown>[],
    insertValues: [] as Record<string, unknown>[],
    deleted: 0,
  },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/votingState", () => ({ getVotingState: mockGetVotingState }));
vi.mock("@/lib/gameEnd", () => ({ checkGameOver: mockCheckGameOver }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: mockPublish })) } },
  ABLY_CHANNELS: {
    game: (id: string) => `game-${id}`,
    vote: (id: string, day: number) => `vote-${id}-${day}`,
    spy: (id: string, day: number) => `spy-${id}-${day}`,
  },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed" },
}));

vi.mock("@/db", () => {
  const db = {
    select: vi.fn(() => {
      const result = dbState.selectResults[dbState.callIndex] ?? [];
      dbState.callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const orderBy = vi.fn(() => Object.assign(Promise.resolve(result), { limit }));
      const groupBy = vi.fn(() => Object.assign(Promise.resolve(result), { limit, orderBy }));
      const where = vi.fn(() => Object.assign(Promise.resolve(result), { limit, orderBy, groupBy }));
      const join = (): Record<string, unknown> => ({ where, leftJoin: join, innerJoin: join });
      return { from: vi.fn(() => ({ where, leftJoin: join, innerJoin: join })) };
    }),
    insert: vi.fn(() => ({
      values: vi.fn((v: Record<string, unknown>) => {
        dbState.insertValues.push(v);
        return { onConflictDoUpdate: vi.fn().mockResolvedValue([]) };
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(async () => { dbState.deleted += 1; }) })),
    update: vi.fn(() => ({
      set: vi.fn((v: Record<string, unknown>) => {
        dbState.setCalls.push(v);
        return {
          where: vi.fn(() =>
            Object.assign(Promise.resolve([]), {
              returning: vi.fn(async () => dbState.claimResult),
            }),
          ),
        };
      }),
    })),
  };
  // The route runs the tally inside a transaction; the mock just reuses itself.
  const withTx = Object.assign(db, {
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(db),
  });
  return { db: withTx };
});

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name" },
  roles: { id: "id", name: "name", permissions: "permissions" },
  games: {
    id: "id", status: "status", vote_closed_day: "vcd",
    vote_eliminated_user_id: "veu", vote_eliminated_day: "ved",
  },
  game_players: {
    id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", role_id: "rid",
    died_at: "da", died_time_of_day: "dtod",
  },
  votes: { id: "id", game_id: "gid", day: "day", voter_id: "vid", target_id: "tid" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(), and: vi.fn(), sql: vi.fn(), count: vi.fn(),
  lt: vi.fn(), gte: vi.fn(), asc: vi.fn(),
}));

import { GET as getVote, POST as postVote } from "@/app/api/game/[id]/vote/route";

// ── Fixtures ──────────────────────────────────────────────────────
const NOW = Date.now();
const round = (number: number, openOffset: number, closeOffset: number) => ({
  date: "2026-01-15",
  number,
  openMs: NOW + openOffset,
  closeMs: NOW + closeOffset,
});
const state = (over: Record<string, unknown> = {}) => ({
  open: null, last: null, upcoming: null, currentNumber: 2, ...over,
});
const game = (over: Record<string, unknown> = {}) => ({
  id: "G1", status: "active", start_time: Math.floor(NOW / 1000) - 86400,
  vote_window_start: "18:00", vote_window_end: "20:00", timezone: "UTC",
  vote_closed_day: 0, ...over,
});
const player = { user: { id: "10", role: "player" } };
const params = { params: Promise.resolve({ id: "G1" }) };
const get = () => getVote(new NextRequest("http://localhost/api/game/G1/vote"), params);
const post = (body: unknown) =>
  postVote(
    new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    params,
  );

function reset() {
  vi.clearAllMocks();
  dbState.callIndex = 0;
  dbState.selectResults = [];
  dbState.claimResult = [{ id: "G1" }];
  dbState.setCalls = [];
  dbState.insertValues = [];
  dbState.deleted = 0;
  mockAuth.mockResolvedValue(player);
  mockGetVotingState.mockResolvedValue(state());
  delete process.env.ABLY_API_KEY;
}

describe("GET /api/game/[id]/vote", () => {
  beforeEach(reset);

  it("unauthenticated → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });

  it("admin session → 401", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    expect((await get()).status).toBe(401);
  });

  it("unknown game → 404", async () => {
    dbState.selectResults = [[]];
    expect((await get()).status).toBe(404);
  });

  it("non-participant → 403", async () => {
    dbState.selectResults = [[game()], []];
    expect((await get()).status).toBe(403);
  });

  it("open round → alive players with live counts and the caller's own vote", async () => {
    mockGetVotingState.mockResolvedValue(state({ open: round(2, -1000, 5000) }));
    dbState.selectResults = [
      [game()],
      [{ permissions: null }],
      [
        { id: 10, name: "Alice", is_dead: 0 },
        { id: 20, name: "Bob", is_dead: 0 },
        { id: 30, name: "Carl", is_dead: 1 },
      ],
      [{ target_id: 20, vote_count: 3 }],
      [{ target_id: 20 }],
    ];
    const json = (await (await get()).json()).data;
    expect(json.windowOpen).toBe(true);
    expect(json.day).toBe(2);
    expect(json.callerVotedFor).toBe(20);
    expect(json.players).toEqual([
      { id: 10, name: "Alice", voteCount: 0 },
      { id: 20, name: "Bob", voteCount: 3 },
    ]);
    expect(json.window_close_utc_ms).toBe(NOW + 5000);
    expect(json.votes).toBeUndefined();
  });

  it("open round + see_killer → canVote false", async () => {
    mockGetVotingState.mockResolvedValue(state({ open: round(2, -1000, 5000) }));
    dbState.selectResults = [[game()], [{ permissions: '["see_killer"]' }], [], [], []];
    const json = (await (await get()).json()).data;
    expect(json.canVote).toBe(false);
  });

  it("open round + see_votes → voter breakdown included", async () => {
    mockGetVotingState.mockResolvedValue(state({ open: round(2, -1000, 5000) }));
    dbState.selectResults = [
      [game()],
      [{ permissions: '["see_votes"]' }],
      [{ id: 20, name: "Bob", is_dead: 0 }],
      [],
      [],
      [{ voter_id: 10, voter_name: "Alice", target_id: 20 }],
      [{ user_id: 20, name: "Bob" }],
    ];
    const json = (await (await get()).json()).data;
    expect(json.votes).toEqual([
      { voterId: 10, voterName: "Alice", targetId: 20, targetName: "Bob" },
    ]);
  });

  it("before today's window → only the opening time, no results", async () => {
    mockGetVotingState.mockResolvedValue(
      state({ upcoming: round(2, 3600_000, 7200_000), currentNumber: 2 }),
    );
    dbState.selectResults = [[game()], [{ permissions: null }]];
    const json = (await (await get()).json()).data;
    expect(json.windowOpen).toBe(false);
    expect(json.window_open_utc_ms).toBe(NOW + 3600_000);
    expect(json.results).toEqual([]);
    expect(dbState.setCalls).toHaveLength(0);
  });
});

describe("GET /api/game/[id]/vote — closing a finished round", () => {
  beforeEach(reset);

  const finished = () =>
    state({ last: round(2, -7200_000, -3600_000), upcoming: round(3, 80000_000, 90000_000), currentNumber: 2 });

  // game, caller, claim → tally, voters → (winner update) → shown results
  const seq = (tally: unknown[], voters: unknown[]) => [
    [game({ vote_closed_day: 1 })],
    [{ permissions: null }],
    tally,
    voters,
    tally,
  ];
  const alive = (n: number) => Array.from({ length: n }, () => ({ is_dead: 0, permissions: null }));

  it("strict majority of living voters → eliminated, game-over check, event published", async () => {
    process.env.ABLY_API_KEY = "k";
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq(
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }],
      alive(5),
    );
    const json = (await (await get()).json()).data;
    expect(json.windowOpen).toBe(false);
    expect(json.eliminated).toEqual({ id: 20, name: "Bob" });
    expect(dbState.setCalls.some((c) => c.vote_closed_day === 2)).toBe(true);
    expect(dbState.setCalls.some((c) => c.is_dead === 1 && c.died_time_of_day === "evening")).toBe(true);
    expect(mockCheckGameOver).toHaveBeenCalledWith("G1");
    expect(mockPublish).toHaveBeenCalledWith("vote_closed", expect.objectContaining({ eliminated: { id: 20, name: "Bob" } }));
  });

  it("a single vote among many living voters is NOT a majority", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq(
      [{ target_id: 20, target_name: "Bob", vote_count: 1 }],
      alive(6),
    );
    const json = (await (await get()).json()).data;
    expect(json.eliminated).toBeNull();
    expect(dbState.setCalls.some((c) => c.is_dead === 1)).toBe(false);
  });

  it("tie at the top → nobody eliminated", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq(
      [
        { target_id: 20, target_name: "Bob", vote_count: 2 },
        { target_id: 30, target_name: "Carl", vote_count: 2 },
      ],
      alive(4),
    );
    expect((await (await get()).json()).data.eliminated).toBeNull();
  });

  it("see_killer observers do not count toward the majority", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq(
      [{ target_id: 20, target_name: "Bob", vote_count: 2 }],
      [...alive(3), { is_dead: 0, permissions: '["see_killer"]' }, { is_dead: 0, permissions: '["see_killer"]' }],
    );
    expect((await (await get()).json()).data.eliminated).toEqual({ id: 20, name: "Bob" });
  });

  it("missed rounds are closed in order, only the newest is announced", async () => {
    process.env.ABLY_API_KEY = "k";
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = [
      [game({ vote_closed_day: 0 })],
      [{ permissions: null }],
      [], // round 1 tally: no votes
      [], // round 1 voters
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }], // round 2 tally
      alive(4), // round 2 voters
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }], // shown results
    ];
    await get();
    const claims = dbState.setCalls.filter((c) => "vote_closed_day" in c).map((c) => c.vote_closed_day);
    expect(claims).toEqual([1, 2]);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("a failed realtime publish does not fail the request or undo the tally", async () => {
    process.env.ABLY_API_KEY = "k";
    mockPublish.mockRejectedValueOnce(new Error("ably down"));
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq(
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }],
      alive(5),
    );
    const res = await get();
    expect(res.status).toBe(200);
    expect((await res.json()).data.eliminated).toEqual({ id: 20, name: "Bob" });
  });

  it("round already tallied → no second close, elimination is looked up", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = [
      [game({ vote_closed_day: 2 })],
      [{ permissions: null }],
      [{ id: 20, day: 2, name: "Bob" }],
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }],
    ];
    const json = (await (await get()).json()).data;
    expect(dbState.setCalls).toHaveLength(0);
    expect(json.eliminated).toEqual({ id: 20, name: "Bob" });
    expect(json.results).toEqual([{ playerId: 20, name: "Bob", voteCount: 3 }]);
  });

  it("losing the atomic claim to a concurrent request → does not eliminate again", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.claimResult = [];
    dbState.selectResults = [
      [game({ vote_closed_day: 1 })],
      [{ permissions: null }],
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }],
      [{ is_dead: 0, permissions: null }],
      [{ id: 20, day: 2, name: "Bob" }],
      [{ target_id: 20, target_name: "Bob", vote_count: 3 }],
    ];
    await get();
    expect(dbState.setCalls.some((c) => c.is_dead === 1)).toBe(false);
    expect(mockCheckGameOver).not.toHaveBeenCalled();
  });

  it("the vote window stays configured after closing (voting works on later days)", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = seq([], alive(4));
    await get();
    expect(dbState.setCalls.some((c) => "vote_window_start" in c || "vote_window_end" in c)).toBe(false);
  });

  it("inactive game is never closed by a read", async () => {
    mockGetVotingState.mockResolvedValue(finished());
    dbState.selectResults = [[game({ status: "closed" })], [{ permissions: null }], [], []];
    await get();
    expect(dbState.setCalls).toHaveLength(0);
  });
});

describe("POST /api/game/[id]/vote", () => {
  beforeEach(() => {
    reset();
    mockGetVotingState.mockResolvedValue(state({ open: round(2, -1000, 5000) }));
  });

  const valid = () => [
    [game()],
    [{ id: 1, is_dead: 0, permissions: null }],
    [{ id: 99 }],
    [], // no previous vote
    [{ vote_closed_day: 0 }],
    [{ name: "Alice" }],
    [{ name: "Bob" }],
  ];

  it("unauthenticated → 401", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await post({ targetId: 20 })).status).toBe(401);
  });

  it("invalid body → 422", async () => {
    expect((await post({ targetId: "x" })).status).toBe(422);
  });

  it("inactive game → 403", async () => {
    dbState.selectResults = [[game({ status: "scheduled" })]];
    expect((await post({ targetId: 20 })).status).toBe(403);
  });

  it("no open round → 403 'Voting is closed'", async () => {
    mockGetVotingState.mockResolvedValue(state());
    dbState.selectResults = [[game()]];
    const res = await post({ targetId: 20 });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Voting is closed");
  });

  it("dead caller → 403", async () => {
    dbState.selectResults = [[game()], [{ id: 1, is_dead: 1, permissions: null }]];
    expect((await post({ targetId: 20 })).status).toBe(403);
  });

  it("see_killer observer → 403", async () => {
    dbState.selectResults = [[game()], [{ id: 1, is_dead: 0, permissions: '["see_killer"]' }]];
    expect((await post({ targetId: 20 })).status).toBe(403);
  });

  it("target that is dead or not in the game → 422", async () => {
    dbState.selectResults = [[game()], [{ id: 1, is_dead: 0, permissions: null }], []];
    expect((await post({ targetId: 999 })).status).toBe(422);
    expect(dbState.insertValues).toHaveLength(0);
  });

  it("valid vote is stored against the open round's number", async () => {
    dbState.selectResults = valid();
    const res = await post({ targetId: 20 });
    expect(res.status).toBe(200);
    expect(dbState.insertValues[0]).toMatchObject({ game_id: "G1", day: 2, voter_id: 10, target_id: 20 });
  });

  it("a vote that lands after the round was tallied is dropped and refused", async () => {
    dbState.selectResults = [
      [game()],
      [{ id: 1, is_dead: 0, permissions: null }],
      [{ id: 99 }],
      [],
      [{ vote_closed_day: 2 }],
    ];
    const res = await post({ targetId: 20 });
    expect(res.status).toBe(403);
    expect(dbState.deleted).toBe(1);
  });

  it("self-vote is allowed", async () => {
    dbState.selectResults = valid();
    expect((await post({ targetId: 10 })).status).toBe(200);
  });

  it("public channel gets counters only; voter identity goes to the spy channel", async () => {
    process.env.ABLY_API_KEY = "k";
    dbState.selectResults = [
      [game()],
      [{ id: 1, is_dead: 0, permissions: null }],
      [{ id: 99 }],
      [{ target_id: 30 }], // previously voted for 30
      [{ vote_closed_day: 0 }],
      [{ name: "Alice" }],
      [{ name: "Bob" }],
    ];
    await post({ targetId: 20 });
    const calls = mockPublish.mock.calls as [string, Record<string, unknown>][];
    const publicCall = calls.find(([, d]) => !("voterId" in d))!;
    const spyCall = calls.find(([, d]) => "voterId" in d)!;
    expect(publicCall[1]).toEqual({ targetId: 20, previousTargetId: 30 });
    expect(spyCall[1]).toMatchObject({ voterId: 10, voterName: "Alice", targetId: 20, targetName: "Bob" });
  });

  it("re-voting for the same target sends no public counter event", async () => {
    process.env.ABLY_API_KEY = "k";
    dbState.selectResults = [
      [game()],
      [{ id: 1, is_dead: 0, permissions: null }],
      [{ id: 99 }],
      [{ target_id: 20 }],
      [{ vote_closed_day: 0 }],
      [{ name: "Alice" }],
      [{ name: "Bob" }],
    ];
    await post({ targetId: 20 });
    const calls = mockPublish.mock.calls as [string, Record<string, unknown>][];
    expect(calls.every(([, d]) => "voterId" in d)).toBe(true);
  });
});
