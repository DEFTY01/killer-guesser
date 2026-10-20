import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockRequireAdmin, state } = vi.hoisted(() => ({
  mockRequireAdmin: vi.fn(),
  state: { updated: [{ id: 7 }] as unknown[], sets: [] as Record<string, unknown>[] },
}));

vi.mock("@/lib/auth-helpers", () => ({ requireAdmin: mockRequireAdmin }));
vi.mock("@/db", () => ({
  db: {
    update: () => ({
      set: (v: Record<string, unknown>) => {
        state.sets.push(v);
        return { where: () => ({ returning: async () => state.updated }) };
      },
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  game_players: { id: "id", game_id: "gid" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { POST } from "@/app/api/admin/games/[id]/players/[playerId]/pin/route";

const call = (body?: unknown, playerId = "7") =>
  POST(
    new NextRequest("http://localhost/api/admin/games/G1/players/7/pin", {
      method: "POST",
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "G1", playerId }) },
  );

describe("POST /api/admin/games/[id]/players/[playerId]/pin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue(true);
    state.updated = [{ id: 7 }];
    state.sets = [];
  });

  it("non-admin → 403, nothing written", async () => {
    mockRequireAdmin.mockResolvedValue(null);
    expect((await call()).status).toBe(403);
    expect(state.sets).toHaveLength(0);
  });

  it("no body → reset: PIN cleared, counters and lockout cleared", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.json()).data.hasPin).toBe(false);
    expect(state.sets[0]).toEqual({ pin_hash: null, pin_failed_attempts: 0, pin_locked_until: null });
  });

  it("with a 4-digit pin → stored hashed, never in plain text", async () => {
    const res = await call({ pin: "4821" });
    expect(res.status).toBe(200);
    const saved = state.sets[0].pin_hash as string;
    expect(saved).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(saved).not.toContain("4821");
    expect(JSON.stringify(await res.json())).not.toContain("4821");
  });

  it("bad PIN formats are rejected", async () => {
    for (const pin of ["12", "12345", "abcd"]) {
      expect((await call({ pin })).status).toBe(422);
    }
    expect(state.sets).toHaveLength(0);
  });

  it("player not in this game → 404", async () => {
    state.updated = [];
    expect((await call()).status).toBe(404);
  });
});
