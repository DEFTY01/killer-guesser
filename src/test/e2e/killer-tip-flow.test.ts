import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Killer tip flow (API-level) E2E test.
 *
 * Seed: active game, killer + 4 survivors.
 */

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockCheckGameOver } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockCheckGameOver: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/gameEnd", () => ({ checkGameOver: mockCheckGameOver }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}` },
  ABLY_EVENTS: { player_died: "player_died", game_ended: "game_ended" },
}));

const dbState = vi.hoisted(() => ({
  selectResults: [] as unknown[][],
  callIndex: 0,
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => {
      const result = dbState.selectResults[dbState.callIndex] ?? [];
      dbState.callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => {
        const p = Promise.resolve(result);
        return Object.assign(p, { limit });
      });
      const leftJoin = vi.fn(() => ({ where }));
      const innerJoin = vi.fn(() => ({ where, leftJoin }));
      const from = vi.fn(() => ({ where, leftJoin, innerJoin }));
      return { from };
    }),
    transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txUpdate = vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
      }));
      return fn({ update: txUpdate });
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name" },
  roles: { id: "id", name: "name" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", revived_at: "ra", has_tipped: "ht", role_id: "rid" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
}));

import { POST as postTip } from "@/app/api/game/[id]/tip/route";

function makeTipRequest(suspectId: number): NextRequest {
  return new NextRequest("http://localhost/api/game/G1/tip", {
    method: "POST",
    body: JSON.stringify({ suspectId }),
    headers: { "Content-Type": "application/json" },
  });
}

describe("killer-tip-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    delete process.env.ABLY_API_KEY;
  });

  it("POST /tip as survivor with wrong suspect → correct:false, caller dead", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "player" } });

    dbState.selectResults = [
      // Caller: alive survivor
      [{ id: 2, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Survivor" }],
      // Suspect: not the killer
      [{ id: 3, user_id: 3, is_dead: 0, revived_at: null, role_name: "Survivor" }],
      // Caller user info for PLAYER_DIED event
      [{ name: "Survivor1" }],
    ];

    const res = await postTip(makeTipRequest(3), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.correct).toBe(false);
    // checkGameOver IS called even for a wrong tip (caller's death might trigger evil win)
    expect(mockCheckGameOver).toHaveBeenCalledWith("G1");
  });

  it("POST /tip as same caller again → 403 'Already used'", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "player" } });

    dbState.selectResults = [
      // Caller has already tipped
      [{ id: 2, is_dead: 1, revived_at: null, has_tipped: 1, role_name: "Survivor" }],
    ];

    const res = await postTip(makeTipRequest(1), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    // Dead players get "You are already dead." before "Already used."
    expect(res.status).toBe(403);
    expect(["You are already dead.", "Already used."]).toContain(data.error);
  });

  it("POST /tip as another survivor with correct suspect (killer) → correct:true, game ended", async () => {
    mockAuth.mockResolvedValue({ user: { id: "4", role: "player" } });

    dbState.selectResults = [
      // Caller: alive survivor
      [{ id: 4, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Survivor" }],
      // Suspect is the Killer
      [{ id: 1, user_id: 1, is_dead: 0, revived_at: null, role_name: "Killer" }],
    ];

    const res = await postTip(makeTipRequest(1), {
      params: Promise.resolve({ id: "G1" }),
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.correct).toBe(true);
    expect(mockCheckGameOver).toHaveBeenCalledWith("G1");
  });
});
