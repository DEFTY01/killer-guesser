import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: hoist shared mock variables so vi.mock factories can use them
const { mockPublish, mockChannelGet, txMock, mockTransaction, mockSelect } = vi.hoisted(
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

    // Top-level db.select mock (for checkGameOver non-transaction queries).
    const selectChain = {
      from: vi.fn(),
    };
    const sel = vi.fn(() => selectChain);
    selectChain.from = vi.fn(() => ({
      where: vi.fn(() => ({
        limit: vi.fn().mockResolvedValue([]),
      })),
      where2: vi.fn().mockResolvedValue([]),
    }));

    return {
      mockPublish: publish,
      mockChannelGet: get,
      txMock: tx,
      mockTransaction: transaction,
      mockSelect: sel,
    };
  }
);

// ── Module mocks ──────────────────────────────────────────────────
vi.mock("@/db", () => ({
  db: {
    transaction: mockTransaction,
    select: mockSelect,
  },
}));

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
  checkGameOver,
  handleGoodWins,
  handleEvilWins,
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
// handleGoodWins
// ─────────────────────────────────────────────────────────────────

describe("handleGoodWins", () => {
  it("sets game status='closed', winner_team='team2' (default goodTeamId)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleGoodWins("game123");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("team2");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("sets winner_team to provided goodTeamId", async () => {
    await handleGoodWins("game123", "team1");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team1");
  });

  it("archives events (is_archived=1)", async () => {
    await handleGoodWins("game123");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("deletes future events", async () => {
    await handleGoodWins("game123");
    expect(txMock.delete).toHaveBeenCalled();
  });

  it("publishes GAME_ENDED Ably event with winner_team='team2'", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleGoodWins("game123");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game123");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", { winner_team: "team2" });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// handleEvilWins
// ─────────────────────────────────────────────────────────────────

describe("handleEvilWins", () => {
  it("sets status='closed', winner_team='team1' (default evilTeamId)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleEvilWins("game456");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("team1");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("sets winner_team to provided evilTeamId", async () => {
    await handleEvilWins("game456", "team2");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team2");
  });

  it("archives events", async () => {
    await handleEvilWins("game456");
    const call = findSetCall((a) => a.is_archived === 1);
    expect(call).toBeDefined();
  });

  it("publishes GAME_ENDED with winner_team='team1'", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleEvilWins("game456");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", { winner_team: "team1" });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });
});

// ─────────────────────────────────────────────────────────────────
// checkGameOver
// ─────────────────────────────────────────────────────────────────

describe("checkGameOver", () => {
  function setupCheckGameOver(
    evil_team_is_team1: number,
    players: Array<{ team: string; is_dead: number }>,
  ) {
    let callCount = 0;
    mockSelect.mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        // First call: db.select({ evil_team_is_team1 }).from(games).where(...).limit(1)
        return {
          from: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ evil_team_is_team1 }]),
            }),
          }),
        };
      }
      // Second call: db.select({ team, is_dead }).from(game_players).where(...)
      return {
        from: () => ({
          where: vi.fn().mockResolvedValue(players),
        }),
      };
    });
  }

  it("calls handleGoodWins when all evil players are dead (team1=evil)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      setupCheckGameOver(1, [
        { team: "team1", is_dead: 1 }, // evil, dead
        { team: "team2", is_dead: 0 }, // good, alive
      ]);
      await checkGameOver("game-good-wins");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("team2");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("calls handleEvilWins when all good players are dead (team1=evil)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      setupCheckGameOver(1, [
        { team: "team1", is_dead: 0 }, // evil, alive
        { team: "team2", is_dead: 1 }, // good, dead
      ]);
      await checkGameOver("game-evil-wins");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("team1");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("does not close game when both teams have alive players", async () => {
    setupCheckGameOver(1, [
      { team: "team1", is_dead: 0 }, // evil, alive
      { team: "team2", is_dead: 0 }, // good, alive
    ]);
    await checkGameOver("game-ongoing");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeUndefined();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("respects evil_team_is_team1=0 (team2=evil)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      setupCheckGameOver(0, [
        { team: "team2", is_dead: 1 }, // evil (team2), dead
        { team: "team1", is_dead: 0 }, // good (team1), alive
      ]);
      await checkGameOver("game-inverted");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      // Good team is team1 when evil_team_is_team1=0
      expect(closeCall![0].winner_team).toBe("team1");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("returns early if game not found", async () => {
    mockSelect.mockImplementation(() => ({
      from: () => ({
        where: () => ({
          limit: vi.fn().mockResolvedValue([]),
        }),
      }),
    }));
    await checkGameOver("no-game");
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("multi-killer: good wins only when ALL evil players are dead", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      // Two evil players: one dead, one alive → game continues
      setupCheckGameOver(1, [
        { team: "team1", is_dead: 1 }, // evil, dead
        { team: "team1", is_dead: 0 }, // evil, alive (second killer)
        { team: "team2", is_dead: 0 }, // good, alive
      ]);
      await checkGameOver("game-multi-killer");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeUndefined();
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
