import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// ── Hoist mocks ──────────────────────────────────────────────────

const { mockRequireAdmin, mockDbSelect, mockDbInsert, mockDbUpdate, mockDbDelete } =
  vi.hoisted(() => {
    return {
      mockRequireAdmin: vi.fn(),
      mockDbSelect: vi.fn(),
      mockDbInsert: vi.fn(),
      mockDbUpdate: vi.fn(),
      mockDbDelete: vi.fn(),
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
  vote_window_overrides: {
    id: "id",
    game_id: "game_id",
    day_date: "day_date",
    window_start: "window_start",
    window_end: "window_end",
    created_at: "created_at",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
  sql: vi.fn(),
}));

import {
  GET,
  POST,
} from "@/app/api/admin/games/[id]/vote-window-override/route";
import { DELETE } from "@/app/api/admin/games/[id]/vote-window-override/[day_date]/route";

// ── Helpers ───────────────────────────────────────────────────────

function makeSelectMock(results: unknown[][]) {
  let callIndex = 0;
  mockDbSelect.mockImplementation(() => {
    const result = results[callIndex] ?? [];
    callIndex++;
    const limit = vi.fn().mockResolvedValue(result);
    const orderBy = vi.fn().mockResolvedValue(result);
    const where = vi.fn(() => ({ limit, orderBy }));
    const from = vi.fn(() => ({ where, orderBy }));
    return { from };
  });
}

// ── GET /api/admin/games/[id]/vote-window-override ────────────────

describe("GET /api/admin/games/[id]/vote-window-override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
    );
    const res = await GET(req, { params: Promise.resolve({ id: "G1" }) });
    expect(res.status).toBe(403);
  });

  it("returns all overrides sorted by day_date desc", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const rows = [
      { id: 2, game_id: "G1", day_date: "2026-03-12", window_start: "10:00", window_end: "11:00", created_at: 1000 },
      { id: 1, game_id: "G1", day_date: "2026-03-11", window_start: "09:00", window_end: "10:00", created_at: 999 },
    ];

    const orderBy = vi.fn().mockResolvedValue(rows);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    mockDbSelect.mockReturnValue({ from });

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
    );
    const res = await GET(req, { params: Promise.resolve({ id: "G1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.data[0].day_date).toBe("2026-03-12");
    expect(json.data[1].day_date).toBe("2026-03-11");
  });
});

// ── POST /api/admin/games/[id]/vote-window-override ───────────────

describe("POST /api/admin/games/[id]/vote-window-override", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
      {
        method: "POST",
        body: JSON.stringify({ day_date: "2026-03-11", window_start: "10:00", window_end: "11:00" }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "G1" }) });
    expect(res.status).toBe(403);
  });

  it("returns 422 on invalid body", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
      {
        method: "POST",
        body: JSON.stringify({ day_date: "not-a-date", window_start: "10:00", window_end: "11:00" }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "G1" }) });
    expect(res.status).toBe(422);
  });

  it("inserts a new override when none exists", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const savedRow = {
      id: 1,
      game_id: "G1",
      day_date: "2026-03-11",
      window_start: "10:00",
      window_end: "11:00",
      created_at: 1000,
    };

    // First select (check existing) → empty; second select (fetch saved) → row
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      const result = selectCall === 0 ? [] : [savedRow];
      selectCall++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const values = vi.fn().mockResolvedValue(undefined);
    mockDbInsert.mockReturnValue({ values });

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
      {
        method: "POST",
        body: JSON.stringify({
          day_date: "2026-03-11",
          window_start: "10:00",
          window_end: "11:00",
        }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "G1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.day_date).toBe("2026-03-11");
    expect(mockDbInsert).toHaveBeenCalledOnce();
  });

  it("upserts (updates) when override already exists for same date", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const existingRow = { id: 42 };
    const savedRow = {
      id: 42,
      game_id: "G1",
      day_date: "2026-03-11",
      window_start: "14:00",
      window_end: "15:00",
      created_at: 1001,
    };

    // First select (check existing) → existing; second select (fetch saved) → updated row
    let selectCall = 0;
    mockDbSelect.mockImplementation(() => {
      const result = selectCall === 0 ? [existingRow] : [savedRow];
      selectCall++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const where = vi.fn().mockResolvedValue(undefined);
    const set = vi.fn(() => ({ where }));
    mockDbUpdate.mockReturnValue({ set });

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override",
      {
        method: "POST",
        body: JSON.stringify({
          day_date: "2026-03-11",
          window_start: "14:00",
          window_end: "15:00",
        }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ id: "G1" }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    // Should update, not insert
    expect(mockDbUpdate).toHaveBeenCalledOnce();
    expect(mockDbInsert).not.toHaveBeenCalled();
    expect(json.data.window_start).toBe("14:00");
  });
});

// ── DELETE /api/admin/games/[id]/vote-window-override/[day_date] ──

describe("DELETE /api/admin/games/[id]/vote-window-override/[day_date]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 403 when not admin", async () => {
    mockRequireAdmin.mockResolvedValue(null);

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override/2026-03-11",
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "G1", day_date: "2026-03-11" }),
    });
    expect(res.status).toBe(403);
  });

  it("deletes the row and returns success", async () => {
    mockRequireAdmin.mockResolvedValue(true);

    const where = vi.fn().mockResolvedValue(undefined);
    mockDbDelete.mockReturnValue({ where });

    const req = new NextRequest(
      "http://localhost/api/admin/games/G1/vote-window-override/2026-03-11",
      { method: "DELETE" },
    );
    const res = await DELETE(req, {
      params: Promise.resolve({ id: "G1", day_date: "2026-03-11" }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockDbDelete).toHaveBeenCalledOnce();
  });
});
