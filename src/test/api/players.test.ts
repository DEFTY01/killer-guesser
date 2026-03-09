import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockRequireAdmin, mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete, mockDbFrom, mockDbWhere, mockDbLimit, mockDbReturning, mockDbOrderBy, mockDbValues, mockDbSet, mockDbLeftJoin, mockDbGroupBy } = vi.hoisted(() => {
  const returning = vi.fn().mockResolvedValue([]);
  const values = vi.fn(() => ({ returning }));
  const set = vi.fn(() => ({ where: vi.fn(() => ({ returning })) }));
  const limit = vi.fn().mockResolvedValue([]);
  const orderBy = vi.fn().mockResolvedValue([]);
  const groupBy = vi.fn(() => ({ orderBy }));
  const leftJoin = vi.fn(() => ({ where: vi.fn().mockResolvedValue([]), groupBy }));
  const where = vi.fn(() => ({ limit, returning, orderBy }));
  const from = vi.fn(() => ({ where, orderBy, leftJoin, groupBy }));
  const select = vi.fn(() => ({ from }));
  const insert = vi.fn(() => ({ values }));
  const update = vi.fn(() => ({ set }));
  const del = vi.fn(() => ({ where: vi.fn().mockResolvedValue(undefined) }));

  return {
    mockRequireAdmin: vi.fn(),
    mockDbSelect: select,
    mockDbInsert: insert,
    mockDbUpdate: update,
    mockDbDelete: del,
    mockDbFrom: from,
    mockDbWhere: where,
    mockDbLimit: limit,
    mockDbReturning: returning,
    mockDbOrderBy: orderBy,
    mockDbValues: values,
    mockDbSet: set,
    mockDbLeftJoin: leftJoin,
    mockDbGroupBy: groupBy,
  };
});

vi.mock("@/lib/auth-helpers", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
    insert: mockDbInsert,
    update: mockDbUpdate,
    delete: mockDbDelete,
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", is_active: "is_active" },
  roles: { id: "id", is_default: "is_default", name: "name", permissions: "permissions" },
  games: { id: "id" },
  game_players: { id: "id" },
  game_settings: { game_id: "game_id" },
  votes: { id: "id" },
  events: { id: "id" },
}));

vi.mock("drizzle-orm", () => ({
  asc: vi.fn(),
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
}));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn() })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: vi.fn() },
  ABLY_EVENTS: { vote_closed: "vote_closed", game_ended: "game_ended" },
}));

// ── Import routes ────────────────────────────────────────────────

import { GET as getPlayers, POST as createPlayer } from "@/app/api/admin/players/route";
import { PATCH as patchPlayer, DELETE as deletePlayer } from "@/app/api/admin/players/[id]/route";
import { DELETE as deleteRole } from "@/app/api/admin/roles/[id]/route";
import { NextRequest } from "next/server";

// ── Helpers ──────────────────────────────────────────────────────

function makeRequest(method: string, body?: Record<string, unknown>, url = "http://localhost/api/admin/players"): NextRequest {
  const init: Record<string, unknown> = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(url, init as ConstructorParameters<typeof NextRequest>[1]);
}

// ──────────────────────────────────────────────────────────────────
// Players tests
// ──────────────────────────────────────────────────────────────────

describe("GET /api/admin/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no session → 403", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    const res = await getPlayers();
    expect(res.status).toBe(403);
  });

  it("admin cookie → 200, returns array of players", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    const players = [
      { id: 1, name: "Alice", is_active: 1 },
      { id: 2, name: "Bob", is_active: 1 },
    ];
    mockDbOrderBy.mockResolvedValue(players);

    const res = await getPlayers();
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data).toEqual(players);
  });
});

describe("POST /api/admin/players", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("missing name → 422 with validation error", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const req = makeRequest("POST", {});
    const res = await createPlayer(req);
    expect(res.status).toBe(422);
  });

  it("valid body → 201, new player returned", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    const newPlayer = { id: 3, name: "Charlie", role: "player", avatar_url: null };
    mockDbReturning.mockResolvedValue([newPlayer]);

    const req = makeRequest("POST", { name: "Charlie" });
    const res = await createPlayer(req);
    const data = await res.json();

    expect(res.status).toBe(201);
    expect(data.success).toBe(true);
    expect(data.data.name).toBe("Charlie");
  });
});

describe("PATCH /api/admin/players/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("valid update → 200, db row updated", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    const updated = { id: 1, name: "Alice Updated", is_active: 1 };

    // mock the chained update().set().where().returning()
    const returningFn = vi.fn().mockResolvedValue([updated]);
    const whereFn = vi.fn(() => ({ returning: returningFn }));
    const setFn = vi.fn(() => ({ where: whereFn }));
    mockDbUpdate.mockReturnValue({ set: setFn });

    const req = makeRequest("PATCH", { name: "Alice Updated" });
    const res = await patchPlayer(req, { params: Promise.resolve({ id: "1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.name).toBe("Alice Updated");
  });

  it("unknown id → 404", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const returningFn = vi.fn().mockResolvedValue([]);
    const whereFn = vi.fn(() => ({ returning: returningFn }));
    const setFn = vi.fn(() => ({ where: whereFn }));
    mockDbUpdate.mockReturnValue({ set: setFn });

    const req = makeRequest("PATCH", { name: "Whatever" });
    const res = await patchPlayer(req, { params: Promise.resolve({ id: "999" }) });

    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/admin/players/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("hard-deletes the player and related data, returns 200", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    // Mock existence check: player exists
    mockDbLimit.mockResolvedValue([{ id: 1, name: "Alice", is_active: 1 }]);

    const req = makeRequest("DELETE");
    const res = await deletePlayer(req, { params: Promise.resolve({ id: "1" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.id).toBe(1);
    // Verify delete was called (not update)
    expect(mockDbDelete).toHaveBeenCalled();
  });

  it("unknown id → 404", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    // Mock existence check: player does not exist
    mockDbLimit.mockResolvedValue([]);

    const req = makeRequest("DELETE");
    const res = await deletePlayer(req, { params: Promise.resolve({ id: "999" }) });

    expect(res.status).toBe(404);
  });
});

// ──────────────────────────────────────────────────────────────────
// Roles tests
// ──────────────────────────────────────────────────────────────────

describe("DELETE /api/admin/roles/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("is_default=1 → 403 'Default roles cannot be deleted'", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    mockDbLimit.mockResolvedValue([{ id: 1, is_default: 1 }]);

    const req = makeRequest("DELETE");
    const res = await deleteRole(req, { params: Promise.resolve({ id: "1" }) });
    const data = await res.json();

    expect(res.status).toBe(403);
    expect(data.error).toBe("Default roles cannot be deleted");
  });

  it("is_default=0 → 200, row deleted", async () => {
    mockRequireAdmin.mockResolvedValue(true);
    mockDbLimit.mockResolvedValue([{ id: 2, is_default: 0 }]);

    const req = makeRequest("DELETE");
    const res = await deleteRole(req, { params: Promise.resolve({ id: "2" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.id).toBe(2);
  });
});
