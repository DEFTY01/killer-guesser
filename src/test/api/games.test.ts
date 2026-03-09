import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockRequireAdmin, mockTransaction, mockDbSelect, mockDbUpdate, mockDbDelete } = vi.hoisted(() => {
  const returningFn = vi.fn().mockResolvedValue([]);
  const whereFn = vi.fn(() => ({ returning: returningFn, limit: vi.fn().mockResolvedValue([]) }));
  const setFn = vi.fn(() => ({ where: whereFn }));
  const valuesFn = vi.fn(() => ({ returning: returningFn }));
  const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
  const limitFn = vi.fn().mockResolvedValue([]);

  return {
    mockRequireAdmin: vi.fn(),
    mockTransaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txInsertReturning = vi.fn().mockResolvedValue([{ id: "TEST123", name: "Test Game" }]);
      const txInsertValues = vi.fn(() => ({ returning: txInsertReturning }));
      const txInsert = vi.fn(() => ({ values: txInsertValues }));
      const tx = { insert: txInsert };
      return fn(tx);
    }),
    mockDbSelect: vi.fn(() => ({ from: fromFn })),
    mockDbUpdate: vi.fn(() => ({ set: setFn })),
    mockDbDelete: vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) })),
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    update: mockDbUpdate,
    delete: mockDbDelete,
    transaction: mockTransaction,
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name" },
  roles: { id: "id", name: "name", is_default: "is_default" },
  games: { id: "id", status: "status", vote_window_start: "vws", vote_window_end: "vwe", start_time: "st", created_at: "ca" },
  game_players: { id: "id", game_id: "game_id", user_id: "user_id" },
  game_settings: { game_id: "game_id" },
  votes: { id: "id", game_id: "game_id", day: "day", target_id: "target_id" },
  events: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
  inArray: vi.fn(),
}));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn() })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: vi.fn() },
  ABLY_EVENTS: { vote_closed: "vote_closed", game_ended: "game_ended" },
}));

vi.mock("@/lib/gameEnd", () => ({
  closeGame: vi.fn(),
  deleteGame: vi.fn(),
}));

vi.mock("@/lib/activateGame", () => ({
  activateGameIfReady: vi.fn(),
}));

vi.mock("@/lib/assignTeamsAndRoles", () => ({
  assignTeamsAndRoles: vi.fn(() => [
    { userId: 1, team: "team1", roleId: null },
    { userId: 2, team: "team2", roleId: null },
  ]),
}));

import { POST as createGame } from "@/app/api/admin/games/route";
import { PATCH as patchGame } from "@/app/api/admin/games/[id]/route";

function makeRequest(method: string, body?: Record<string, unknown>, url = "http://localhost/api/admin/games"): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

describe("POST /api/admin/games", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("missing required fields → 422", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const req = makeRequest("POST", {});
    const res = await createGame(req);
    expect(res.status).toBe(422);
  });

  it("valid payload → 201, game created via transaction", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    // Mock db.select for role lookups (Killer + Survivor)
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const req = makeRequest("POST", {
      name: "Test Game",
      start_time: 1700000000,
      player_ids: [1, 2],
    });
    const res = await createGame(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(mockTransaction).toHaveBeenCalled();
  });

  it("simulated insert failure → transaction rolls back (error thrown)", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    mockTransaction.mockRejectedValue(new Error("DB insert failed"));

    // Mock db.select for role lookups
    const limitFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const req = makeRequest("POST", {
      name: "Failing Game",
      start_time: 1700000000,
      player_ids: [1],
    });

    await expect(createGame(req)).rejects.toThrow("DB insert failed");
  });
});

describe("PATCH /api/admin/games/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("action='update_vote_window' with valid HH:MM → 200", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    // Mock the game existence check
    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    // Mock the update
    const returningFn = vi.fn().mockResolvedValue([{ id: "G1", vote_window_start: "18:00", vote_window_end: "20:00" }]);
    const updateWhereFn = vi.fn(() => ({ returning: returningFn, limit: vi.fn().mockResolvedValue([]) }));
    const setFn = vi.fn(() => ({ where: updateWhereFn }));
    mockDbUpdate.mockReturnValue({ set: setFn });

    const req = makeRequest("PATCH", {
      action: "update_vote_window",
      vote_window_start: "18:00",
      vote_window_end: "20:00",
    });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(200);
  });

  it("action='update_vote_window' with invalid time format → 422", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const req = makeRequest("PATCH", {
      action: "update_vote_window",
      vote_window_start: "invalid",
      vote_window_end: "20:00",
    });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });

    expect(res.status).toBe(422);
  });

  it("action='start' → game status becomes 'active'", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "scheduled" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const returningFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const updateWhereFn = vi.fn(() => ({ returning: returningFn, limit: vi.fn().mockResolvedValue([]) }));
    const setFn = vi.fn(() => ({ where: updateWhereFn }));
    mockDbUpdate.mockReturnValue({ set: setFn });

    const req = makeRequest("PATCH", { action: "start" });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.status).toBe("active");
  });

  it("action='start' on non-scheduled game → 422", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const req = makeRequest("PATCH", { action: "start" });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(422);
    expect(data.error).toContain("Only scheduled games can be started");
  });

  it("action='close' → game status becomes 'closed'", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const returningFn = vi.fn().mockResolvedValue([{ id: "G1", status: "closed" }]);
    const updateWhereFn = vi.fn(() => ({ returning: returningFn, limit: vi.fn().mockResolvedValue([]) }));
    const setFn = vi.fn(() => ({ where: updateWhereFn }));
    mockDbUpdate.mockReturnValue({ set: setFn });

    const req = makeRequest("PATCH", { action: "close" });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.status).toBe("closed");
  });

  it("action='delete' → all related rows removed", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const limitFn = vi.fn().mockResolvedValue([{ id: "G1", status: "active" }]);
    const whereFn = vi.fn(() => ({ returning: vi.fn().mockResolvedValue([]), limit: limitFn }));
    const fromFn = vi.fn(() => ({ where: whereFn, leftJoin: vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy: vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue([]) })) })), orderBy: vi.fn().mockResolvedValue([]) }));
    mockDbSelect.mockReturnValue({ from: fromFn });

    const req = makeRequest("PATCH", { action: "delete" });
    const res = await patchGame(req, { params: Promise.resolve({ id: "G1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.id).toBe("G1");
    expect(mockDbDelete).toHaveBeenCalled();
  });
});
