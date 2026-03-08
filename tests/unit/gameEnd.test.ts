import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: hoist shared mock variables so vi.mock factories can use them

const { mockPublish, mockChannelGet, txMock, mockTransaction } = vi.hoisted(() => {
  const publish = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn(() => ({ publish }));

  // A single tx object whose methods all return itself (Drizzle-style chaining).
  const tx = {} as Record<string, ReturnType<typeof vi.fn>>;
  tx.limit = vi.fn().mockResolvedValue([]);
  tx.innerJoin = vi.fn(() => tx);
  tx.from = vi.fn(() => tx);
  tx.select = vi.fn(() => tx);
  tx.delete = vi.fn(() => tx);
  tx.where = vi.fn(() => tx);
  tx.set = vi.fn(() => tx);
  tx.update = vi.fn(() => tx);

  const transaction = vi.fn(
    async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx),
  );

  return {
    mockPublish: publish,
    mockChannelGet: get,
    txMock: tx,
    mockTransaction: transaction,
  };
});

// ── Module mocks ──────────────────────────────────────────────────

vi.mock("@/db", () => ({ db: { transaction: mockTransaction } }));

vi.mock("ably", () => ({
  default: {
    // Must use a regular function (not arrow) so `new Ably.Rest()` works.
    Rest: vi.fn(function () {
      return { channels: { get: mockChannelGet } };
    }),
  },
}));

// ── Imports (after mocks are registered) ─────────────────────────

import {
  handleKillerDefeated,
  handleKillerWins,
  deleteGame,
  closeGame,
} from "@/lib/gameEnd";

// ── Helpers ───────────────────────────────────────────────────────

type SetCallArg = Record<string, unknown>;

function findSetCall(predicate: (arg: SetCallArg) => boolean) {
  return txMock.set.mock.calls.find(
    (args: unknown[]) =>
      typeof args[0] === "object" && args[0] !== null && predicate(args[0] as SetCallArg),
  ) as [SetCallArg] | undefined;
}

// ── Reset mocks before each test ─────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();

  // Restore chainable tx methods and defaults after clearAllMocks.
  txMock.limit = vi.fn().mockResolvedValue([]);
  txMock.innerJoin = vi.fn(() => txMock);
  txMock.from = vi.fn(() => txMock);
  txMock.select = vi.fn(() => txMock);
  txMock.delete = vi.fn(() => txMock);
  txMock.where = vi.fn(() => txMock);
  txMock.set = vi.fn(() => txMock);
  txMock.update = vi.fn(() => txMock);

  mockTransaction.mockImplementation(
    async (fn: (arg: typeof txMock) => Promise<unknown>) => fn(txMock),
  );

  mockChannelGet.mockReturnValue({ publish: mockPublish });
  mockPublish.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────
// handleKillerDefeated
// ─────────────────────────────────────────────────────────────────

describe("handleKillerDefeated", () => {
  it("runs inside a database transaction", async () => {
    await handleKillerDefeated("game123");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("archives past events (set is_archived = 1)", async () => {
    await handleKillerDefeated("game123");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("closes the game (set status = 'closed')", async () => {
    await handleKillerDefeated("game123");
    const call = findSetCall((a) => a.status === "closed");
    expect(call).toBeDefined();
  });

  it("publishes game_ended to the correct Ably channel", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleKillerDefeated("game123");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game123");
      const [, payload] = mockPublish.mock.calls[0] as [string, { winner_team: unknown }];
      expect(["string", "object"].includes(typeof payload.winner_team) || payload.winner_team === null).toBe(true);
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("skips Ably publish when ABLY_API_KEY is absent", async () => {
    delete process.env.ABLY_API_KEY;
    await handleKillerDefeated("game123");
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("sets winner_team to the survivors team (team2_name) when killer is on team1", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      // First limit() call → game record; second → killer player on team1.
      txMock.limit = vi.fn()
        .mockResolvedValueOnce([{ team1_name: "Good", team2_name: "Evil" }])
        .mockResolvedValueOnce([{ team: "team1" }]);

      await handleKillerDefeated("game123");

      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("Evil");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// handleKillerWins
// ─────────────────────────────────────────────────────────────────

describe("handleKillerWins", () => {
  it("runs inside a database transaction", async () => {
    await handleKillerWins("game456");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("archives past events (set is_archived = 1)", async () => {
    await handleKillerWins("game456");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("closes the game (set status = 'closed')", async () => {
    await handleKillerWins("game456");
    const call = findSetCall((a) => a.status === "closed");
    expect(call).toBeDefined();
  });

  it("sets winner_team to the killer's team (team1_name) when killer is on team1", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      // First limit() call → game record; second → killer player on team1.
      txMock.limit = vi.fn()
        .mockResolvedValueOnce([{ team1_name: "Good", team2_name: "Evil" }])
        .mockResolvedValueOnce([{ team: "team1" }]);

      await handleKillerWins("game456");

      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("Good");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("publishes game_ended to the correct Ably channel", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleKillerWins("game456");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game456");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", expect.any(Object));
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteGame
// ─────────────────────────────────────────────────────────────────

describe("deleteGame", () => {
  it("runs inside a database transaction", async () => {
    await deleteGame("game789");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("hard-deletes the game record", async () => {
    await deleteGame("game789");
    expect(txMock.delete).toHaveBeenCalled();
  });

  it("does not archive any events", async () => {
    await deleteGame("game789");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeUndefined();
  });

  it("publishes game_ended with null winner_team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await deleteGame("game789");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game789");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", { winner_team: null });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// closeGame
// ─────────────────────────────────────────────────────────────────

describe("closeGame", () => {
  it("runs inside a database transaction", async () => {
    await closeGame("gameABC");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("sets only status = 'closed' (no winner_team, no is_archived)", async () => {
    await closeGame("gameABC");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(Object.keys(closeCall![0])).toEqual(["status"]);
  });

  it("does not delete any records", async () => {
    await closeGame("gameABC");
    expect(txMock.delete).not.toHaveBeenCalled();
  });

  it("does not archive any events", async () => {
    await closeGame("gameABC");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeUndefined();
  });

  it("publishes game_ended with null winner_team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await closeGame("gameABC");
      expect(mockChannelGet).toHaveBeenCalledWith("game-gameABC");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", { winner_team: null });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});
