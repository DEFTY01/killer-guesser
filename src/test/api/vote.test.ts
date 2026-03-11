import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockPublish, mockChannelGet, mockResolveVoteWindow, mockIsVoteWindowOpen } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockChannelGet: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })),
  mockResolveVoteWindow: vi.fn().mockResolvedValue(null),
  mockIsVoteWindowOpen: vi.fn().mockReturnValue(false),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: mockChannelGet } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed", game_ended: "game_ended", player_died: "player_died" },
}));

vi.mock("@/lib/gameEnd", () => ({
  checkGameOver: vi.fn().mockResolvedValue(undefined),
}));

// Chainable DB mock
const dbMock = vi.hoisted(() => {
  const makeMockChain = () => {
    const returning = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn(() => Object.assign(Promise.resolve([]), { limit }));
    const groupBy = vi.fn(() => Object.assign(Promise.resolve([]), { orderBy, limit }));
    const where = vi.fn(() => {
      const result = Promise.resolve([]);
      return Object.assign(result, { limit, orderBy, returning, groupBy });
    });
    const leftJoin = vi.fn(() => ({ where, orderBy }));
    const innerJoin = vi.fn(() => ({ where, leftJoin, orderBy, groupBy }));
    const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy, groupBy }));
    return { from, where, limit, orderBy, returning, leftJoin, innerJoin, groupBy };
  };

  return {
    selectResults: [] as unknown[][],
    callIndex: 0,
    makeMockChain,
  };
});

vi.mock("@/db", () => {
  return {
    db: {
      select: vi.fn(() => {
        const resultForThisCall = dbMock.selectResults[dbMock.callIndex] ?? [];
        dbMock.callIndex++;
        const returning = vi.fn().mockResolvedValue(resultForThisCall);
        const limit = vi.fn().mockResolvedValue(resultForThisCall);
        const orderBy = vi.fn(() => Object.assign(Promise.resolve(resultForThisCall), { limit }));
        const groupBy = vi.fn(() => {
          return Object.assign(Promise.resolve(resultForThisCall), {
            orderBy: vi.fn(() => Object.assign(Promise.resolve(resultForThisCall), { limit })),
            limit,
          });
        });
        const where = vi.fn(() => {
          const result = Promise.resolve(resultForThisCall);
          return Object.assign(result, { limit, orderBy, returning, groupBy });
        });
        const leftJoin = vi.fn(() => ({ where, orderBy }));
        const innerJoin = vi.fn(() => ({ where, leftJoin, orderBy, groupBy }));
        const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy, groupBy }));
        return { from };
      }),
      insert: vi.fn(() => ({
        values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => {
            const result = Promise.resolve([]);
            return Object.assign(result, { returning: vi.fn().mockResolvedValue([]) });
          }),
        })),
      })),
      transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
        const txUpdate = vi.fn(() => ({
          set: vi.fn(() => ({
            where: vi.fn(() => Promise.resolve([])),
          })),
        }));
        const txInsert = vi.fn(() => ({
          values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })),
        }));
        return fn({ update: txUpdate, insert: txInsert });
      }),
    },
  };
});

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", avatar_url: "avatar_url" },
  roles: { id: "id", name: "name", permissions: "permissions" },
  games: { id: "id", start_time: "start_time", vote_window_start: "vws", vote_window_end: "vwe", status: "status" },
  game_players: { id: "id", game_id: "game_id", user_id: "user_id", is_dead: "is_dead", revived_at: "revived_at", role_id: "role_id", has_tipped: "has_tipped" },
  votes: { id: "id", game_id: "game_id", day: "day", voter_id: "voter_id", target_id: "target_id" },
  vote_window_overrides: { id: "id", game_id: "game_id", day_date: "day_date", window_start: "window_start", window_end: "window_end" },
}));

vi.mock("@/lib/voteWindow", () => ({
  resolveVoteWindow: mockResolveVoteWindow,
  isVoteWindowOpen: mockIsVoteWindowOpen,
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
}));

import { POST as postVote, GET as getVote } from "@/app/api/game/[id]/vote/route";

describe("GET /api/game/[id]/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.callIndex = 0;
    dbMock.selectResults = [];
    delete process.env.ABLY_API_KEY;
    mockIsVoteWindowOpen.mockReturnValue(false);
    mockResolveVoteWindow.mockResolvedValue(null);
  });

  it("unauthorized → 401", async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(401);
  });

  it("non-player role → 401", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin", role: "admin" } });

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(401);
  });

  it("game not found → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      [], // no game found
    ];

    const req = new NextRequest("http://localhost/api/game/NOTEXIST/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "NOTEXIST" }) });

    expect(res.status).toBe(404);
  });

  it("not a participant → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil" }],
      [], // caller not a participant
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(403);
  });

  it("window open → returns windowOpen:true and alive players list", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil", timezone: "UTC" }],
      // Caller row (no special permissions)
      [{ game_player_id: 1, permissions: null, is_dead: 0, revived_at: null }],
      // All alive players
      [
        { id: 10, name: "Alice", avatarUrl: null, is_dead: 0, revived_at: null },
        { id: 20, name: "Bob", avatarUrl: null, is_dead: 0, revived_at: null },
      ],
      // Vote tally
      [],
      // Existing vote by caller
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(true);
  });

  it("window open + see_killer caller → canVote:false in response", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil", timezone: "UTC" }],
      // Caller has see_killer permission
      [{ game_player_id: 1, permissions: '["see_killer"]', is_dead: 0, revived_at: null }],
      // All alive players
      [
        { id: 10, name: "Alice", avatarUrl: null, is_dead: 0, revived_at: null },
        { id: 20, name: "Bob", avatarUrl: null, is_dead: 0, revived_at: null },
      ],
      // Vote tally
      [],
      // Existing vote by caller
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(true);
    expect(data.data.canVote).toBe(false);
  });

  it("window not open → returns windowOpen:false", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      // Game with no window set
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil" }],
      // Caller row
      [{ game_player_id: 1, permissions: null, is_dead: 0, revived_at: null }],
      // Tally (empty)
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(false);
  });

  it("Spy caller (see_votes) → includes vote breakdown", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      // Game with no window
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil" }],
      // Caller row with see_votes
      [{ game_player_id: 1, permissions: '["see_votes"]', is_dead: 0, revived_at: null }],
      // Tally
      [],
      // Enriched votes
      [{ voter_id: 10, voter_name: "Alice", target_id: 20 }],
      // Player map
      [{ user_id: 10, avatar_url: null, name: "Alice" }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.votes).toBeDefined();
  });

  it("window open + Spy (see_votes) → includes full voter breakdown", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, team1_name: "Good", team2_name: "Evil", timezone: "UTC" }],
      // Caller is Spy with see_votes
      [{ game_player_id: 1, permissions: '["see_votes"]', is_dead: 0, revived_at: null }],
      // All alive players
      [
        { id: 10, name: "Alice", avatarUrl: null, is_dead: 0, revived_at: null },
        { id: 20, name: "Bob", avatarUrl: null, is_dead: 0, revived_at: null },
      ],
      // Vote tally
      [{ target_id: 20, vote_count: 1 }],
      // Existing vote by caller
      [{ target_id: 20 }],
      // Enriched votes
      [{ voter_id: 10, voter_name: "Alice", target_id: 20 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(true);
    expect(data.data.votes).toBeDefined();
  });

  it("invalid session userId (NaN) → 401", async () => {
    mockAuth.mockResolvedValue({ user: { id: "notanumber", role: "player" } });

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(401);
  });

  it("lazy close: window ended → returns windowOpen:false with results", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    // Set vote window that has already ended (past time)
    const now = new Date();
    const pastEndH = String((now.getUTCHours() - 1 + 24) % 24).padStart(2, "0");
    const pastEndM = String(now.getUTCMinutes()).padStart(2, "0");
    const pastStartH = String((now.getUTCHours() - 2 + 24) % 24).padStart(2, "0");

    dbMock.selectResults = [
      // Game with ended window
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `${pastStartH}:${pastEndM}`, vote_window_end: `${pastEndH}:${pastEndM}`, team1_name: "Good", team2_name: "Evil" }],
      // Caller row
      [{ game_player_id: 1, permissions: null, is_dead: 0, revived_at: null }],
      // Lazy close: update().set().where().returning() returns the cleared game ID
      // This is handled by the db.update mock
      // Tally for lazy close (no votes = tie = no elimination)
      [],
      // Reloaded game
      [{ vote_window_start: null, vote_window_end: null }],
      // Tally for results
      [],
      // Evening dead
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(false);
  });

  it("lazy close: window ended + plurality elimination → updates game", async () => {
    process.env.ABLY_API_KEY = "test-key";
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    // Set vote window that has already ended
    const now = new Date();
    const pastEndH = String((now.getUTCHours() - 1 + 24) % 24).padStart(2, "0");
    const pastEndM = String(now.getUTCMinutes()).padStart(2, "0");
    const pastStartH = String((now.getUTCHours() - 2 + 24) % 24).padStart(2, "0");

    dbMock.selectResults = [
      // Game with ended window
      [{ id: "G1", name: "Test", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `${pastStartH}:${pastEndM}`, vote_window_end: `${pastEndH}:${pastEndM}`, team1_name: "Good", team2_name: "Evil" }],
      // Caller row
      [{ game_player_id: 1, permissions: null, is_dead: 0, revived_at: null }],
      // Tally: player 20 has 2 votes, player 10 has 1 vote → plurality winner is 20
      [{ target_id: 20, target_name: "Bob", vote_count: 2 }, { target_id: 10, target_name: "Alice", vote_count: 1 }],
      // Killer check: target is NOT the killer
      [],
      // Reloaded game
      [{ vote_window_start: null, vote_window_end: null }],
      // Tally for results
      [{ target_id: 20, target_name: "Bob", vote_count: 2 }],
      // Evening dead
      [{ user_id: 20, name: "Bob" }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote");
    const res = await getVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.windowOpen).toBe(false);
    delete process.env.ABLY_API_KEY;
  });
});

describe("POST /api/game/[id]/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.callIndex = 0;
    dbMock.selectResults = [];
    delete process.env.ABLY_API_KEY;
    mockIsVoteWindowOpen.mockReturnValue(false);
    mockResolveVoteWindow.mockResolvedValue(null);
  });

  it("outside vote window → 403 'Voting is closed'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      // Game lookup - no active window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Voting is closed");
  });

  it("dead player → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game with open window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      // Caller is dead, no revival
      [{ id: 1, is_dead: 1, revived_at: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(403);
  });

  it("valid vote → 200", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game with open window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      // Caller is alive
      [{ id: 1, is_dead: 0, revived_at: null }],
      // No existing vote
      [],
      // Voter user info
      [{ name: "Alice", avatar_url: null }],
      // Target user info
      [{ name: "Bob", avatar_url: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("unauthorized POST → 401", async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(401);
  });

  it("invalid body → 422", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: "notanumber" }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(422);
  });

  it("second vote by same player → updates existing row (upsert)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      [{ id: 1, is_dead: 0, revived_at: null }],
      // Existing vote found (upsert case)
      [{ id: 5 }],
      [{ name: "Alice", avatar_url: null }],
      [{ name: "Charlie", avatar_url: null }],
    ];

    const { db } = await import("@/db");
    const updateMock = db.update as ReturnType<typeof vi.fn>;
    const returningFn = vi.fn().mockResolvedValue([]);
    const setWhereFn = vi.fn(() => Promise.resolve([]));
    const setFn = vi.fn(() => ({ where: setWhereFn }));
    updateMock.mockReturnValue({ set: setFn });

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 30 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    // Update should have been called (not insert) for upsert
    expect(updateMock).toHaveBeenCalled();
  });

  it("game not found → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbMock.selectResults = [
      [], // no game found
    ];

    const req = new NextRequest("http://localhost/api/game/NOTEXIST/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "NOTEXIST" }) });

    expect(res.status).toBe(404);
  });

  it("not a participant → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      [], // caller not a participant
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(403);
  });

  it("valid vote with ABLY_API_KEY → publishes VOTE_CAST event", async () => {
    vi.useFakeTimers();
    process.env.ABLY_API_KEY = "test-key";
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      [{ id: 1, is_dead: 0, revived_at: null }],
      [], // no existing vote
      [{ name: "Alice" }],
      [{ name: "Bob" }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    // Advance fake timers to fire the debounce callback
    vi.runAllTimers();

    expect(res.status).toBe(200);
    expect(mockChannelGet).toHaveBeenCalled();
    delete process.env.ABLY_API_KEY;
    vi.useRealTimers();
  });

  it("invalid session userId → 401", async () => {
    mockAuth.mockResolvedValue({ user: { id: "notanumber", role: "player" } });

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(401);
  });

  it("see_killer player → 403 'Players with killer knowledge cannot vote'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbMock.selectResults = [
      // Game with open window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `12:00`, vote_window_end: `13:00`, timezone: "UTC" }],
      // Caller is alive but has see_killer permission (e.g. the Spy / Seer role)
      [{ id: 1, is_dead: 0, revived_at: null, permissions: '["see_killer"]' }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Players with killer knowledge cannot vote");
  });
});
