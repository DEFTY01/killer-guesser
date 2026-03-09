import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockPublish, mockChannelGet } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockPublish: vi.fn().mockResolvedValue(undefined),
  mockChannelGet: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: mockChannelGet } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed", game_ended: "game_ended", player_died: "player_died" },
}));

vi.mock("@/lib/gameEnd", () => ({
  handleKillerDefeated: vi.fn(),
}));

// Chainable DB mock
const dbMock = vi.hoisted(() => {
  const makeMockChain = () => {
    const returning = vi.fn().mockResolvedValue([]);
    const limit = vi.fn().mockResolvedValue([]);
    const orderBy = vi.fn().mockResolvedValue([]);
    const groupBy = vi.fn(() => ({ orderBy }));
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
        const orderBy = vi.fn().mockResolvedValue(resultForThisCall);
        const groupBy = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(resultForThisCall) }));
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

import { POST as postVote } from "@/app/api/game/[id]/vote/route";

describe("POST /api/game/[id]/vote", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbMock.callIndex = 0;
    dbMock.selectResults = [];
    delete process.env.ABLY_API_KEY;
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

    // Set up a window that is currently open
    const now = new Date();
    const startH = String(now.getUTCHours()).padStart(2, "0");
    const startM = String(now.getUTCMinutes()).padStart(2, "0");
    const endH = String((now.getUTCHours() + 1) % 24).padStart(2, "0");

    dbMock.selectResults = [
      // Game with open window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `${startH}:${startM}`, vote_window_end: `${endH}:${startM}` }],
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

    const now = new Date();
    const startH = String(now.getUTCHours()).padStart(2, "0");
    const startM = String(now.getUTCMinutes()).padStart(2, "0");
    const endH = String((now.getUTCHours() + 1) % 24).padStart(2, "0");

    dbMock.selectResults = [
      // Game with open window
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: `${startH}:${startM}`, vote_window_end: `${endH}:${startM}` }],
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
});
