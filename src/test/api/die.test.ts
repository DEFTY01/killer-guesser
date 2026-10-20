import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockCheckGameOver, mockPublish, state } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckGameOver: vi.fn().mockResolvedValue(undefined),
  mockPublish: vi.fn().mockRejectedValue(new Error("ably down")),
  state: { game: [{ status: "active" }] as unknown[], updated: [] as unknown[] },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/gameEnd", () => ({ checkGameOver: mockCheckGameOver }));
vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: () => ({ publish: mockPublish }) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}` },
  ABLY_EVENTS: { player_died: "player_died" },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({ from: () => ({ where: () => ({ limit: async () => state.game }) }) }),
    update: () => ({
      set: () => ({ where: () => ({ returning: async () => state.updated }) }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  games: { id: "id", status: "status" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn() }));

import { PATCH } from "@/app/api/game/[id]/players/[playerId]/die/route";

const call = () =>
  PATCH(
    new NextRequest("http://localhost/api/game/G1/players/5/die", {
      method: "PATCH",
      body: JSON.stringify({ location: "Lift", time_of_day: "morning" }),
      headers: { "Content-Type": "application/json" },
    }),
    { params: Promise.resolve({ id: "G1", playerId: "5" }) },
  );

describe("PATCH /api/game/[id]/players/[playerId]/die", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    state.game = [{ status: "active" }];
    state.updated = [{ id: 5, user_id: 10, is_dead: 1 }];
    process.env.ABLY_API_KEY = "k";
  });

  it("inactive game → 403", async () => {
    state.game = [{ status: "closed" }];
    expect((await call()).status).toBe(403);
  });

  it("already dead (guarded update matches nothing) → 404, no second death", async () => {
    state.updated = [];
    expect((await call()).status).toBe(404);
    expect(mockCheckGameOver).not.toHaveBeenCalled();
  });

  it("win check still runs when the realtime publish fails", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    expect(mockCheckGameOver).toHaveBeenCalledWith("G1");
  });

  it("response never contains PIN data", async () => {
    const json = await (await call()).json();
    expect(JSON.stringify(json)).not.toMatch(/pin/i);
  });
});
