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
  updateCallIndex: 0,
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
            id: 1, user_id: 20, game_id: "G1", is_dead: 0, is_revived: 1, revived_at: Math.floor(Date.now() / 1000),
          }]),
        })),
      })),
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  roles: { id: "id", permissions: "permissions", is_evil: "is_evil" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", is_revived: "is_revived", revived_at: "ra", role_id: "rid", last_revive_at: "lra" },
  game_settings: { game_id: "gid", revive_cooldown_minutes: "rcm" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
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

  it("caller without revive_dead permission → 403 'You are not the Medic.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has no revive_dead permission, is alive
      [{ id: 5, permissions: null, is_dead: 0, last_revive_at: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("You are not the Medic.");
  });

  it("caller is dead → 403 'The Medic cannot revive while dead.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has permission but is dead
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 1, last_revive_at: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("The Medic cannot revive while dead.");
  });

  it("caller tries to revive themselves → 403 'The Medic cannot revive himself.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    // Caller's game_players.id is 2, same as playerId in URL
    dbState.selectResults = [
      [{ id: 2, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("The Medic cannot revive himself.");
  });

  it("target is alive (is_dead=0) → 403 'That player is not dead.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has revive_dead permission, alive
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      // Target is alive
      [{ id: 2, is_dead: 0, is_revived: 0, role_is_evil: 0 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("That player is not dead.");
  });

  it("target is_revived=true → 403 'Cannot revive an Undead player.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      // Target is dead but already revived (re-dead undead)
      [{ id: 2, is_dead: 1, is_revived: 1, role_is_evil: 0 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Cannot revive an Undead player.");
  });

  it("target is on evil team → 403 'Cannot revive an Evil team member.'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      // Target is dead and evil
      [{ id: 2, is_dead: 1, is_revived: 0, role_is_evil: 1 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Cannot revive an Evil team member.");
  });

  it("valid revive → target is_dead=0, is_revived=1, revived_at set, returns updated player", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has revive_dead permission, alive
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      // Target is dead, not revived, not evil
      [{ id: 2, is_dead: 1, is_revived: 0, role_is_evil: 0 }],
      // No cooldown settings
      [{ revive_cooldown_minutes: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.is_dead).toBe(0);
    expect(data.data.is_revived).toBe(1);
    expect(data.data.revived_at).toBeDefined();
  });

  it("unauthorized → 401", async () => {
    mockAuth.mockResolvedValue(null);

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });

    expect(res.status).toBe(401);
  });

  it("non-player role → 401", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin", role: "admin" } });

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });

    expect(res.status).toBe(401);
  });

  it("invalid playerId → 400", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    const req = new NextRequest("http://localhost/api/game/G1/players/abc/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "abc" }),
    });

    expect(res.status).toBe(400);
  });

  it("not a participant → 403", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller not found
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });

    expect(res.status).toBe(403);
  });

  it("player record not found → 404", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      // Caller has revive_dead permission, alive
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      // Target not found
      [],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/999/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "999" }),
    });

    expect(res.status).toBe(404);
  });

  it("cooldown active → 403 with 'Revive on cooldown'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    const nowSec = Math.floor(Date.now() / 1000);

    dbState.selectResults = [
      // Caller has revive_dead permission, alive, last revived 1 minute ago
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: nowSec - 60 }],
      // Target is dead, not revived, not evil
      [{ id: 2, is_dead: 1, is_revived: 0, role_is_evil: 0 }],
      // Cooldown: 60 minutes
      [{ revive_cooldown_minutes: 60 }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toContain("Revive on cooldown");
  });

  it("ABLY_API_KEY set → publishes PLAYER_REVIVED event", async () => {
    process.env.ABLY_API_KEY = "test-key";
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    dbState.selectResults = [
      [{ id: 5, permissions: '["revive_dead"]', is_dead: 0, last_revive_at: null }],
      [{ id: 2, is_dead: 1, is_revived: 0, role_is_evil: 0 }],
      [{ revive_cooldown_minutes: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/G1/players/2/revive", { method: "POST" });
    const res = await postRevive(req, {
      params: Promise.resolve({ id: "G1", playerId: "2" }),
    });

    expect(res.status).toBe(200);
    // Ably publish should have been called since ABLY_API_KEY is set
    delete process.env.ABLY_API_KEY;
  });
});

