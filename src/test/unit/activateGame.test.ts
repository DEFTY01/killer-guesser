import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockDbUpdate } = vi.hoisted(() => {
  const returningFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn(() => ({ returning: returningFn }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  return {
    mockDbUpdate: vi.fn(() => ({ set: setFn })),
  };
});

vi.mock("@/db", () => ({
  db: { update: mockDbUpdate },
}));

vi.mock("@/db/schema", () => ({
  games: { id: "id", status: "status", start_time: "start_time" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  lte: vi.fn(),
}));

import { activateScheduledGames, activateGameIfReady } from "@/lib/activateGame";

describe("activateScheduledGames", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.update to set status='active' for scheduled games", async () => {
    await activateScheduledGames();
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});

describe("activateGameIfReady", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls db.update for the given game id", async () => {
    await activateGameIfReady("GAME1");
    expect(mockDbUpdate).toHaveBeenCalled();
  });
});
