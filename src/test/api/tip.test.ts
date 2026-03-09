import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockHandleKillerDefeated } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockHandleKillerDefeated: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/gameEnd", () => ({ handleKillerDefeated: mockHandleKillerDefeated }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}` },
  ABLY_EVENTS: { player_died: "player_died", game_ended: "game_ended" },
}));

// Chainable DB mock with sequential results
const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  callIndex: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const result = dbState.selectResults[dbState.callIndex] ?? [];
      dbState.callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => {
        const p = Promise.resolve(result);
        return Object.assign(p, { limit });
      });
      const leftJoin = vi.fn(() => ({ where }));
      const innerJoin = vi.fn(() => ({ where, leftJoin }));
      const from = vi.fn(() => ({ where, leftJoin, innerJoin }));
      return { from };
    }),
    transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txUpdate = vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
      }));
      return fn({ update: txUpdate });
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name" },
  roles: { id: "id", name: "name" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", revived_at: "ra", has_tipped: "ht", role_id: "rid" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

import { POST as postTip } from "@/app/api/game/[id]/tip/route";

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/game/G1/tip", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

describe("POST /api/game/[id]/tip", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    delete process.env.ABLY_API_KEY;
  });

  it("dead caller → 403 'You are already dead.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller is dead
      [{ id: 1, is_dead: 1, revived_at: null, has_tipped: 0, role_name: "Villager" }],
    ];

    const res = await postTip(makeRequest({ suspectId: 20 }), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("You are already dead.");
  });

  it("has_tipped=1 → 403 'Already used.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 1, role_name: "Villager" }],
    ];

    const res = await postTip(makeRequest({ suspectId: 20 }), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Already used.");
  });

  it("killer tries to tip → 403 'Killer cannot tip.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Killer" }],
    ];

    const res = await postTip(makeRequest({ suspectId: 20 }), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Killer cannot tip.");
  });

  it("suspectId not found or dead → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Villager" }],
      // Suspect not found
      [],
    ];

    const res = await postTip(makeRequest({ suspectId: 999 }), {
      params: Promise.resolve({ id: "G1" }),
    });

    expect(res.status).toBe(404);
  });

  it("wrong guess → caller is_dead=1, has_tipped=1, { correct: false }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Villager" }],
      // Suspect - not the killer
      [{ id: 2, user_id: 20, is_dead: 0, revived_at: null, role_name: "Survivor" }],
      // Caller user info for Ably
      [{ name: "Alice" }],
    ];

    const res = await postTip(makeRequest({ suspectId: 20 }), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.correct).toBe(false);
  });

  it("correct guess → handleKillerDefeated called, { correct: true }", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Villager" }],
      // Suspect is the Killer
      [{ id: 2, user_id: 20, is_dead: 0, revived_at: null, role_name: "Killer" }],
    ];

    const res = await postTip(makeRequest({ suspectId: 20 }), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.correct).toBe(true);
    expect(mockHandleKillerDefeated).toHaveBeenCalledWith("G1");
  });
});
