import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: hoist shared mock variables so vi.mock factories can use them

const { mockPublish, mockChannelGet, txMock, mockTransaction, mockSelect, mockDbUpdate, mockDbDelete } = vi.hoisted(() => {
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

  // Top-level db.select mock (used by checkGameOver).
  const sel = vi.fn();

  // Top-level db.update / db.delete (used by archiveAndCleanEvents outside tx).
  const dbUpdate = vi.fn(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
  }));
  const dbDelete = vi.fn(() => ({
    where: vi.fn().mockResolvedValue([]),
  }));

  return {
    mockPublish: publish,
    mockChannelGet: get,
    txMock: tx,
    mockTransaction: transaction,
    mockSelect: sel,
    mockDbUpdate: dbUpdate,
    mockDbDelete: dbDelete,
  };
});

// ── Module mocks ──────────────────────────────────────────────────

vi.mock("@/db", () => ({
  db: {
    transaction: mockTransaction,
    select: mockSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
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

vi.mock("@/lib/pollers", () => ({
  cleanupPoller: vi.fn(),
}));

// ── Imports (after mocks are registered) ─────────────────────────

import {
  checkGameOver,
  handleGoodWins,
  handleEvilWins,
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

  mockDbUpdate.mockImplementation(() => ({
    set: vi.fn(() => ({
      where: vi.fn().mockResolvedValue([]),
    })),
  }));
  mockDbDelete.mockImplementation(() => ({
    where: vi.fn().mockResolvedValue([]),
  }));

  mockChannelGet.mockReturnValue({ publish: mockPublish });
  mockPublish.mockResolvedValue(undefined);
});

// ─────────────────────────────────────────────────────────────────
// handleGoodWins
// ─────────────────────────────────────────────────────────────────

describe("handleGoodWins", () => {
  it("runs inside a database transaction", async () => {
    await handleGoodWins("game123");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("archives past events (set is_archived = 1)", async () => {
    await handleGoodWins("game123");
    // archiveAndCleanEvents now runs outside the transaction via db.update
    expect(mockDbUpdate).toHaveBeenCalled();
    const setArg = mockDbUpdate.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> } | undefined;
    expect(setArg?.set).toHaveBeenCalledWith(expect.objectContaining({ is_archived: 1 }));
  });

  it("closes the game (set status = 'closed')", async () => {
    await handleGoodWins("game123");
    const call = findSetCall((a) => a.status === "closed");
    expect(call).toBeDefined();
  });

  it("sets winner_team to the goodTeamId ('team2' by default)", async () => {
    await handleGoodWins("game123");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team2");
  });

  it("sets winner_team to the provided goodTeamId", async () => {
    await handleGoodWins("game123", "team1");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team1");
  });

  it("publishes game_ended to the correct Ably channel", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleGoodWins("game123");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game123");
      expect(mockPublish).toHaveBeenCalledWith("game_ended", { winner_team: "team2" });
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("skips Ably publish when ABLY_API_KEY is absent", async () => {
    delete process.env.ABLY_API_KEY;
    await handleGoodWins("game123");
    expect(mockPublish).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────
// handleEvilWins
// ─────────────────────────────────────────────────────────────────

describe("handleEvilWins", () => {
  it("runs inside a database transaction", async () => {
    await handleEvilWins("game456");
    expect(mockTransaction).toHaveBeenCalledOnce();
  });

  it("archives past events (set is_archived = 1)", async () => {
    await handleEvilWins("game456");
    // archiveAndCleanEvents now runs outside the transaction via db.update
    expect(mockDbUpdate).toHaveBeenCalled();
    const setArg = mockDbUpdate.mock.results[0]?.value as { set: ReturnType<typeof vi.fn> } | undefined;
    expect(setArg?.set).toHaveBeenCalledWith(expect.objectContaining({ is_archived: 1 }));
  });

  it("closes the game (set status = 'closed')", async () => {
    await handleEvilWins("game456");
    const call = findSetCall((a) => a.status === "closed");
    expect(call).toBeDefined();
  });

  it("sets winner_team to the evilTeamId ('team1' by default)", async () => {
    await handleEvilWins("game456");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team1");
  });

  it("sets winner_team to the provided evilTeamId", async () => {
    await handleEvilWins("game456", "team2");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeDefined();
    expect(closeCall![0].winner_team).toBe("team2");
  });

  it("publishes game_ended to the correct Ably channel", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      await handleEvilWins("game456");
      expect(mockChannelGet).toHaveBeenCalledWith("game-game456");
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
        return {
          from: () => ({
            where: () => ({
              limit: vi.fn().mockResolvedValue([{ evil_team_is_team1 }]),
            }),
          }),
        };
      }
      // Second call: db.select({ team, is_dead }).from(game_players).where(...).limit(50)
      return {
        from: () => ({
          where: () => ({
            limit: vi.fn().mockResolvedValue(players),
          }),
        }),
      };
    });
  }

  it("good wins when all evil players are dead (team1=evil)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      setupCheckGameOver(1, [
        { team: "team1", is_dead: 1 },
        { team: "team2", is_dead: 0 },
      ]);
      await checkGameOver("game-good-wins");
      const closeCall = findSetCall((a) => a.status === "closed");
      expect(closeCall).toBeDefined();
      expect(closeCall![0].winner_team).toBe("team2");
    } finally {
      delete process.env.ABLY_API_KEY;
    }
  });

  it("evil wins when all good players are dead (team1=evil)", async () => {
    process.env.ABLY_API_KEY = "test-key";
    try {
      setupCheckGameOver(1, [
        { team: "team1", is_dead: 0 },
        { team: "team2", is_dead: 1 },
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
      { team: "team1", is_dead: 0 },
      { team: "team2", is_dead: 0 },
    ]);
    await checkGameOver("game-ongoing");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeUndefined();
    expect(mockTransaction).not.toHaveBeenCalled();
  });

  it("multi-killer: good wins only when ALL evil players are dead", async () => {
    setupCheckGameOver(1, [
      { team: "team1", is_dead: 1 },
      { team: "team1", is_dead: 0 }, // second killer still alive
      { team: "team2", is_dead: 0 },
    ]);
    await checkGameOver("game-multi-killer");
    const closeCall = findSetCall((a) => a.status === "closed");
    expect(closeCall).toBeUndefined();
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
      expect(closeCall![0].winner_team).toBe("team1");
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

