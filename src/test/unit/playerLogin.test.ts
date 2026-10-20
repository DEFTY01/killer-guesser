import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPin } from "@/lib/credentials";

const { state } = vi.hoisted(() => ({
  state: {
    row: undefined as Record<string, unknown> | undefined,
    attemptsAfterFailure: 1,
    updates: [] as Record<string, unknown>[],
  },
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: () => ({
        innerJoin: () => ({
          innerJoin: () => ({
            where: () => ({ limit: async () => (state.row ? [state.row] : []) }),
          }),
        }),
      }),
    })),
    update: vi.fn(() => ({
      set: (values: Record<string, unknown>) => {
        state.updates.push(values);
        return {
          where: () =>
            Object.assign(Promise.resolve([]), {
              returning: async () => [{ attempts: state.attemptsAfterFailure }],
            }),
        };
      },
    })),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "u.id", name: "u.name", avatar_url: "u.av", is_active: "u.active" },
  games: { id: "g.id", join_code: "g.code", status: "g.status" },
  game_players: {
    id: "gp.id",
    game_id: "gp.gid",
    user_id: "gp.uid",
    pin_hash: "gp.pin",
    pin_failed_attempts: "gp.fail",
    pin_locked_until: "gp.lock",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  or: vi.fn(),
  sql: vi.fn(),
}));

import { verifyPlayerLogin, INVALID_LOGIN } from "@/lib/playerLogin";

const base = () => ({
  gameId: "G1",
  gamePlayerId: 7,
  pinHash: hashPin("0420"),
  lockedUntil: null as number | null,
  userName: "Alice",
  avatarUrl: null,
});

describe("verifyPlayerLogin", () => {
  beforeEach(() => {
    state.row = base();
    state.attemptsAfterFailure = 1;
    state.updates = [];
  });

  it("correct code + player + PIN → session user bound to that game", async () => {
    const user = await verifyPlayerLogin({ gameCode: "abc-234", userId: 3, pin: "0420" });
    expect(user).toMatchObject({ id: "3", name: "Alice", role: "player", activeGameId: "G1" });
  });

  it("wrong PIN → uniform error and counter incremented", async () => {
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "1111" }),
    ).rejects.toThrow(INVALID_LOGIN);
    expect(state.updates).toHaveLength(1);
  });

  it("5th wrong PIN locks the player", async () => {
    state.attemptsAfterFailure = 5;
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "1111" }),
    ).rejects.toThrow(INVALID_LOGIN);
    expect(state.updates.some((u) => typeof u.pin_locked_until === "number")).toBe(true);
  });

  it("locked player is refused even with the right PIN", async () => {
    state.row = { ...base(), lockedUntil: Math.floor(Date.now() / 1000) + 600 };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "0420" }),
    ).rejects.toThrow(/Too many attempts/);
    expect(state.updates).toHaveLength(0);
  });

  it("unknown code or player → same uniform error", async () => {
    state.row = undefined;
    await expect(
      verifyPlayerLogin({ gameCode: "ZZZZZZ", userId: 3, pin: "0420" }),
    ).rejects.toThrow(INVALID_LOGIN);
  });

  it("player without an issued PIN cannot log in", async () => {
    state.row = { ...base(), pinHash: null };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "0420" }),
    ).rejects.toThrow(/No PIN set/);
  });

  it("non-numeric PIN is rejected before touching the database", async () => {
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "abcd" }),
    ).rejects.toThrow(INVALID_LOGIN);
  });
});
