import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}` },
  ABLY_EVENTS: { player_revived: "player_revived" },
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
      const from = vi.fn(() => ({ where, leftJoin }));
      return { from };
    }),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn().mockResolvedValue([{
            id: 1, user_id: 20, game_id: "G1", is_dead: 0, revived_at: Math.floor(Date.now() / 1000),
          }]),
        })),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  roles: { id: "id", permissions: "permissions" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", revived_at: "ra", role_id: "rid" },
  game_settings: { game_id: "gid", revive_cooldown_seconds: "rcs" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  max: vi.fn(),
}));

vi.mock("@/lib/role-constants", () => ({
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
}));

import { POST as postRevive } from "@/app/api/game/[id]/players/[playerId]/revive/route";

describe("POST /api/game/[id]/players/[playerId]/revive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    delete process.env.ABLY_API_KEY;
  });

  it("caller without revive_dead permission → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has no revive_dead permission
      [{ permissions: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Insufficient permissions");
  });

  it("target is alive (is_dead=0) → 409", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has revive_dead permission
      [{ permissions: '["revive_dead"]' }],
      // Target is alive
      [{ id: 2, is_dead: 0 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(409);
    expect(data.error).toBe("Player is not dead");
  });

  it("valid revive → target is_dead=0, revived_at set, returns updated player", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has revive_dead permission
      [{ permissions: '["revive_dead"]' }],
      // Target is dead
      [{ id: 2, is_dead: 1 }],
      // No cooldown settings
      [{ revive_cooldown_seconds: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.is_dead).toBe(0);
    expect(data.data.revived_at).toBeDefined();
  });
});
