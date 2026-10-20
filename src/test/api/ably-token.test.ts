import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockAuth, mockCreateTokenRequest, state } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCreateTokenRequest: vi.fn(),
  state: { memberships: [] as { gameId: string }[] },
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/ably", () => ({
  ablyServer: { auth: { createTokenRequest: mockCreateTokenRequest } },
}));
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: () => ({ limit: async () => state.memberships }) }),
      }),
    }),
  },
}));
vi.mock("@/db/schema", () => ({
  game_players: { game_id: "gid", user_id: "uid" },
  games: { id: "id", status: "status" },
}));
vi.mock("drizzle-orm", () => ({ eq: vi.fn(), and: vi.fn(), inArray: vi.fn() }));

import { GET } from "@/app/api/ably/token/route";

describe("GET /api/ably/token", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ABLY_API_KEY = "test-key";
    state.memberships = [];
    mockCreateTokenRequest.mockResolvedValue({ keyName: "k" });
  });

  it("unauthenticated → 401, no token issued", async () => {
    mockAuth.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    expect(mockCreateTokenRequest).not.toHaveBeenCalled();
  });

  it("player: subscribe-only, limited to the games they take part in", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    state.memberships = [{ gameId: "G1" }, { gameId: "G2" }];
    expect((await GET()).status).toBe(200);
    expect(mockCreateTokenRequest.mock.calls[0][0].capability).toEqual({
      "game-G1": ["subscribe"],
      "vote-G1-*": ["subscribe"],
      "game-G2": ["subscribe"],
      "vote-G2-*": ["subscribe"],
    });
  });

  it("player in no live game gets no token", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });
    expect((await GET()).status).toBe(403);
    expect(mockCreateTokenRequest).not.toHaveBeenCalled();
  });

  it("admin may follow every game", async () => {
    mockAuth.mockResolvedValue({ user: { id: "admin", role: "admin" } });
    expect((await GET()).status).toBe(200);
    expect(mockCreateTokenRequest.mock.calls[0][0].capability).toEqual({
      "game-*": ["subscribe"],
      "vote-*": ["subscribe"],
    });
  });
});
