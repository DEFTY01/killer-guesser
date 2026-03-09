import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockDbSelect, mockDbUpdate } = vi.hoisted(() => {
  return {
    mockAuth: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbUpdate: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  auth: mockAuth,
}));

// Build chainable db mock
function makeChain(defaultResult: unknown[] = []) {
  const returning = vi.fn().mockResolvedValue(defaultResult);
  const limit = vi.fn().mockResolvedValue(defaultResult);
  const orderBy = vi.fn().mockResolvedValue(defaultResult);
  const where = vi.fn(() => ({ limit, returning, orderBy }));
  const leftJoin = vi.fn(() => ({ where, orderBy }));
  const innerJoin = vi.fn(() => ({ where, leftJoin }));
  const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy }));
  return { from, where, limit, orderBy, leftJoin, innerJoin, returning };
}

vi.mock("@/db", () => {
  const chain = makeChain();
  return {
    db: {
      select: vi.fn(() => chain),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]) })) })) })),
    },
  };
});

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", avatar_url: "avatar_url" },
  roles: { id: "id", name: "name", color_hex: "color_hex", permissions: "permissions" },
  games: { id: "id", name: "name", status: "status", start_time: "start_time", team1_name: "t1", team2_name: "t2", vote_window_start: "vws", vote_window_end: "vwe" },
  game_players: { id: "id", game_id: "game_id", user_id: "user_id", team: "team", is_dead: "is_dead", revived_at: "revived_at", role_id: "role_id", has_tipped: "has_tipped" },
  game_settings: { game_id: "game_id", murder_item_url: "miu", murder_item_name: "min" },
  votes: { id: "id", game_id: "game_id", day: "day", voter_id: "voter_id", target_id: "target_id" },
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

// Re-import with actual mock
import { db } from "@/db";

// We need to set up chainable mocks manually for each test
function setupDbSelectChain(callResults: unknown[][]) {
  let callIndex = 0;
  const selectMock = db.select as ReturnType<typeof vi.fn>;

  selectMock.mockImplementation(() => {
    const resultForThisCall = callResults[callIndex] ?? [];
    callIndex++;
    const limit = vi.fn().mockResolvedValue(resultForThisCall);
    const orderBy = vi.fn().mockResolvedValue(resultForThisCall);
    const where = vi.fn(() => {
      const result = Promise.resolve(resultForThisCall);
      return Object.assign(result, { limit, orderBy, returning: vi.fn().mockResolvedValue(resultForThisCall) });
    });
    const leftJoin = vi.fn(() => ({ where, orderBy }));
    const innerJoin = vi.fn(() => ({ where, leftJoin, orderBy }));
    const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy }));
    return { from };
  });
}

import { GET as getBoard } from "@/app/api/game/[id]/board/route";

describe("GET /api/game/[id]/board", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("player with no special permissions → response does NOT contain killerId", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "10", role: "player" },
    });

    setupDbSelectChain([
      // 1. Game lookup
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings lookup
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row (no permissions)
      [{ game_player_id: 1, permissions: null, role_name: "Villager", is_dead: 0, revived_at: null, has_tipped: 0 }],
      // 4. All players
      [{ id: 1, user_id: 10, name: "Alice", avatar_url: null, team: "team1", is_dead: 0, revived_at: null, role_color: "#2E6DA4" }],
    ]);

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.killer_id).toBeUndefined();
  });

  it("Seer (see_killer) → response contains killerId", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "10", role: "player" },
    });

    setupDbSelectChain([
      // 1. Game
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row (Seer with see_killer)
      [{ game_player_id: 1, permissions: '["see_killer"]', role_name: "Seer", is_dead: 0, revived_at: null, has_tipped: 0 }],
      // 4. All players
      [{ id: 1, user_id: 10, name: "Alice", avatar_url: null, team: "team1", is_dead: 0, revived_at: null, role_color: "#2E6DA4" }],
      // 5. Killer lookup
      [{ user_id: 20 }],
    ]);

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.killer_id).toBe(20);
  });

  it("Spy (see_votes) → response contains today's vote details", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "10", role: "player" },
    });

    setupDbSelectChain([
      // 1. Game
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row (Spy with see_votes)
      [{ game_player_id: 1, permissions: '["see_votes"]', role_name: "Spy", is_dead: 0, revived_at: null, has_tipped: 0 }],
      // 4. All players
      [{ id: 1, user_id: 10, name: "Alice", avatar_url: null, team: "team1", is_dead: 0, revived_at: null, role_color: "#2E6DA4" }],
      // 5. Votes lookup
      [{ voter_id: 10, target_id: 20 }],
    ]);

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.votes).toBeDefined();
    expect(Array.isArray(data.data.votes)).toBe(true);
  });

  it("Mayor → response does NOT contain role_color or team for any player", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "10", role: "player" },
    });

    setupDbSelectChain([
      // 1. Game
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row (Mayor)
      [{ game_player_id: 1, permissions: null, role_name: "Mayor", is_dead: 0, revived_at: null, has_tipped: 0 }],
      // 4. All players
      [
        { id: 1, user_id: 10, name: "Alice", avatar_url: null, team: "team1", is_dead: 0, revived_at: null, role_color: "#FF0000" },
        { id: 2, user_id: 20, name: "Bob", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#00FF00" },
      ],
    ]);

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    // Mayor view should strip role_color and team
    for (const player of data.data.players) {
      expect(player.role_color).toBeUndefined();
      expect(player.team).toBeUndefined();
    }
  });

  it("dead player session → still returns board (dead players can observe)", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "10", role: "player" },
    });

    setupDbSelectChain([
      // 1. Game
      [{ id: "G1", name: "Test", status: "active", start_time: Math.floor(Date.now() / 1000) - 86400, team1_name: "Good", team2_name: "Evil", vote_window_start: null, vote_window_end: null }],
      // 2. Settings
      [{ murder_item_url: null, murder_item_name: null }],
      // 3. Caller row (dead player)
      [{ game_player_id: 1, permissions: null, role_name: "Villager", is_dead: 1, revived_at: null, has_tipped: 0 }],
      // 4. All players
      [{ id: 1, user_id: 10, name: "Alice", avatar_url: null, team: "team1", is_dead: 1, revived_at: null, role_color: "#2E6DA4" }],
    ]);

    const req = new NextRequest("http://localhost/api/game/G1/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.players).toHaveLength(1);
  });
});
