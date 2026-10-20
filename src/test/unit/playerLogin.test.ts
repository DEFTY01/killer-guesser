import { describe, it, expect, vi, beforeEach } from "vitest";
import { hashPin } from "@/lib/credentials";

const { state } = vi.hoisted(() => ({
  state: {
    row: undefined as Record<string, unknown> | undefined,
    claim: { attempts: 1 } as { attempts: number } | null,
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
              returning: async () => (state.claim ? [state.claim] : []),
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
  isNull: vi.fn(),
  lte: vi.fn(),
}));

import { verifyPlayerLogin, INVALID_LOGIN, PIN_NOT_SET } from "@/lib/playerLogin";

let pinHash = "";
const base = () => ({
  gameId: "G1",
  gamePlayerId: 7,
  pinHash,
  lockedUntil: null as number | null,
  userName: "Alice",
  avatarUrl: null,
});

describe("verifyPlayerLogin", () => {
  beforeEach(async () => {
    pinHash = pinHash || (await hashPin("0420"));
    state.row = base();
    state.claim = { attempts: 1 };
    state.updates = [];
  });

  it("correct code + player + PIN → session user bound to that game", async () => {
    const user = await verifyPlayerLogin({ gameCode: "abc-234", userId: 3, pin: "0420" });
    expect(user).toMatchObject({ id: "3", name: "Alice", role: "player", activeGameId: "G1" });
  });

  it("success resets the attempt counter", async () => {
    await verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "0420" });
    expect(state.updates.at(-1)).toMatchObject({ pin_locked_until: null });
  });

  it("wrong PIN → uniform error, no lock yet", async () => {
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "1111" }),
    ).rejects.toThrow(INVALID_LOGIN);
    expect(state.updates.some((u) => typeof u.pin_locked_until === "number")).toBe(false);
  });

  it("the 5th wrong PIN locks the player", async () => {
    state.claim = { attempts: 5 };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "1111" }),
    ).rejects.toThrow(INVALID_LOGIN);
    expect(state.updates.some((u) => typeof u.pin_locked_until === "number")).toBe(true);
  });

  it("parallel burst: attempts beyond the limit are refused even with the RIGHT PIN", async () => {
    state.claim = { attempts: 6 };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "0420" }),
    ).rejects.toThrow(/Too many attempts/);
    expect(state.updates).toHaveLength(1); // only the counter claim, no success reset
  });

  it("already locked in the database → claim matches no row → refused", async () => {
    state.claim = null;
    state.row = { ...base(), lockedUntil: Math.floor(Date.now() / 1000) + 600 };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "0420" }),
    ).rejects.toThrow(/Too many attempts/);
  });

  it("unknown code or player → same uniform error", async () => {
    state.row = undefined;
    await expect(
      verifyPlayerLogin({ gameCode: "ZZZZZZ", userId: 3, pin: "0420" }),
    ).rejects.toThrow(INVALID_LOGIN);
  });

  it("no PIN yet and no explicit choice → PIN_NOT_SET, nothing is saved", async () => {
    state.row = { ...base(), pinHash: null };
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "4321" }),
    ).rejects.toThrow(PIN_NOT_SET);
    expect(state.updates).toHaveLength(0);
  });

  it("first login with setPin: the chosen PIN is stored (hashed) and the player is in", async () => {
    state.row = { ...base(), pinHash: null };
    state.claim = { attempts: 0 };
    const user = await verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "4321", setPin: true });
    expect(user).toMatchObject({ id: "3", activeGameId: "G1" });
    const saved = state.updates[0].pin_hash as string;
    expect(saved).toMatch(/^[0-9a-f]+:[0-9a-f]+$/);
    expect(saved).not.toContain("4321");
  });

  it("parallel first claim that loses the race → refused", async () => {
    state.row = { ...base(), pinHash: null };
    state.claim = null;
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "4321", setPin: true }),
    ).rejects.toThrow(INVALID_LOGIN);
  });

  it("setPin on a player who already has a PIN is just a normal (verified) login", async () => {
    await expect(
      verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin: "9999", setPin: true }),
    ).rejects.toThrow(INVALID_LOGIN);
    expect(state.updates.some((u) => u.pin_hash !== undefined)).toBe(false);
  });

  it("malformed PINs are rejected before touching the database", async () => {
    for (const pin of ["abcd", "123", "12345", ""]) {
      await expect(
        verifyPlayerLogin({ gameCode: "ABC234", userId: 3, pin }),
      ).rejects.toThrow(INVALID_LOGIN);
    }
    expect(state.updates).toHaveLength(0);
  });
});
