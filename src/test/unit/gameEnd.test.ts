import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: hoist shared mock variables so vi.mock factories can use them
const { mockPublish, mockChannelGet, txMock, mockTransaction } = vi.hoisted(
  () => {
    const publish = vi.fn().mockResolvedValue(undefined);
    const get = vi.fn(() => ({ publish }));

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
      async (fn: (arg: typeof tx) => Promise<unknown>) => fn(tx)
    );

    return {
      mockPublish: publish,
      mockChannelGet: get,
      txMock: tx,
      mockTransaction: transaction,
    };
  }
);

// ── Module mocks ──────────────────────────────────────────────────
vi.mock("@/db", () => ({ db: { transaction: mockTransaction } }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: mockChannelGet } },
  ABLY_CHANNELS: {
    game: (id: string) => `game-${id}`,
    vote: (id: string, day: number) => `vote-${id}-${day}`,
  },
  ABLY_EVENTS: {
    player_died: "player_died",
    vote_cast: "vote_cast",
    vote_closed: "vote_closed",
    game_ended: "game_ended",
    player_revived: "player_revived",
  },
}));

import {
  handleKillerDefeated,
  handleKillerWins,
  deleteGame,
  closeGame,
} from "@/lib/gameEnd";

type SetCallArg = Record<string, unknown>;

function findSetCall(predicate: (arg: SetCallArg) => boolean) {
  return txMock.set.mock.calls.find(
    (args: unknown[]) =>
      typeof args[0] === "object" &&
      args[0] !== null &&
      predicate(args[0] as SetCallArg)
  ) as [SetCallArg] | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();

  txMock.limit = vi.fn().mockResolvedValue([]);
  txMock.innerJoin = vi.fn(() => txMock);
  txMock.from = vi.fn(() => txMock);
  txMock.select = vi.fn(() => txMock);
  txMock.delete = vi.fn(() => txMock);
  txMock.where = vi.fn(() => txMock);
  txMock.set = vi.fn(() => txMock);
  txMock.update = vi.fn(() => txMock);

  mockTransaction.mockImplementation(
    async (fn: (arg: typeof txMock) => Promise<unknown>) => fn(txMock)
  );

  mockChannelGet.mockReturnValue({ publish: mockPublish });
  mockPublish.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────
// handleKillerDefeated
// ─────────────────────────────────────────────────────────────────

describe("handleKillerDefeated", () => {
  it("sets game status='closed', winner_team=survivors team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      txMock.limit = vi
        .fn()
        .mockResolvedValueOnce([
          { team1_name: "Hunters", team2_name: "Survivors" },
        ])
        .mockResolvedValueOnce([{ team: "team1" }]);

      await handleKillerDefeated("game123");

      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("Survivors");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("archives events (is_archived=1)", async () => {
    await handleKillerDefeated("game123");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("deletes future events", async () => {
    await handleKillerDefeated("game123");
    expect(txMock.delete).toHaveBeenCalled();
  });

  it("publishes GAME_ENDED Ably event", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleKillerDefeated("game123");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game123");
      expect(mockPublish).toHaveBeenCalledWith(
        "game_ended",
        expect.any(Object)
      );
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// handleKillerWins
// ─────────────────────────────────────────────────────────────────

describe("handleKillerWins", () => {
  it("sets status='closed', winner_team=killer team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      txMock.limit = vi
        .fn()
        .mockResolvedValueOnce([
          { team1_name: "Killers", team2_name: "Survivors" },
        ])
        .mockResolvedValueOnce([{ team: "team1" }]);

      await handleKillerWins("game456");

      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("Killers");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("archives events", async () => {
    await handleKillerWins("game456");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("publishes GAME_ENDED", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleKillerWins("game456");
      expect(mockPublish).toHaveBeenCalledWith(
        "game_ended",
        expect.any(Object)
      );
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// deleteGame
// ─────────────────────────────────────────────────────────────────

describe("deleteGame", () => {
  it("hard-deletes all rows", async () => {
    await deleteGame("game789");
    expect(txMock.delete).toHaveBeenCalled();
  });

  it("publishes game_ended with null winner_team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await deleteGame("game789");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", {
        winner_team: null,
      });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// closeGame
// ─────────────────────────────────────────────────────────────────

describe("closeGame", () => {
  it("sets status='closed' only, no deletions, no Ably event with winner", async () => {
    await closeGame("gameABC");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(Object.keys(closeCall![0])).toEqual(["status"]);
    expect(txMock.delete).not.toHaveBeenCalled();
  });

  it("publishes game_ended with null winner_team", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await closeGame("gameABC");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", {
        winner_team: null,
      });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});
