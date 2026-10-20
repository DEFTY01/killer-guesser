import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const { state } = vi.hoisted(() => ({ state: { rows: [] as unknown[] } }));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ orderBy: () => ({ limit: async () => state.rows }) }),
          }),
        }),
      }),
    })),
  },
}));
vi.mock("@/db/schema", () => ({
  games: { name: "n", join_code: "c", status: "s" },
  game_players: { game_id: "g", user_id: "u", pin_hash: "ph" },
  users: { id: "id", name: "name", avatar_url: "a", is_active: "x" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), or: vi.fn(), sql: vi.fn() }));

import { GET } from "@/app/api/login/game/route";

const call = (code: string) =>
  GET(new NextRequest(`http://localhost/api/login/game?code=${code}`));

describe("GET /api/login/game", () => {
  beforeEach(() => {
    state.rows = [];
  });

  it("malformed code → 404 without querying", async () => {
    expect((await call("ab")).status).toBe(404);
  });

  it("unknown or finished game → 404", async () => {
    expect((await call("ABC234")).status).toBe(404);
  });

  it("known code → game name, players and whether each has a PIN, never hashes or roles", async () => {
    state.rows = [
      { gameName: "Ski Trip", id: 1, nickname: "Alice", avatarUrl: null, hasPin: 1 },
      { gameName: "Ski Trip", id: 2, nickname: "Bob", avatarUrl: "/b.png", hasPin: 0 },
    ];
    const res = await call("abc-234");
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.gameName).toBe("Ski Trip");
    expect(json.data.players).toEqual([
      { id: "1", nickname: "Alice", avatarUrl: null, hasPin: true },
      { id: "2", nickname: "Bob", avatarUrl: "/b.png", hasPin: false },
    ]);
  });
});
