import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Hoist DB mock ─────────────────────────────────────────────────

const { mockDbSelect } = vi.hoisted(() => {
  const mockDbSelect = vi.fn();
  return { mockDbSelect };
});

vi.mock("@/db", () => ({
  db: { select: mockDbSelect },
}));

vi.mock("@/db/schema", () => ({
  games: {
    id: "id",
    vote_window_start: "vote_window_start",
    vote_window_end: "vote_window_end",
  },
  vote_window_overrides: {
    id: "id",
    game_id: "game_id",
    day_date: "day_date",
    window_start: "window_start",
    window_end: "window_end",
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
}));

vi.mock("@/lib/timezone", () => ({
  nowInZone: vi.fn(() => 720), // 12:00 by default
}));

import { resolveVoteWindow, isVoteWindowOpen } from "@/lib/voteWindow";
import { nowInZone } from "@/lib/timezone";

// ── Helper: build a chainable select mock that resolves to `result` ─

function makeSelectMock(result: unknown[]) {
  const limit = vi.fn().mockResolvedValue(result);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  return vi.fn(() => ({ from }));
}

// ── resolveVoteWindow ─────────────────────────────────────────────

describe("resolveVoteWindow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(nowInZone).mockReturnValue(720);
  });

  it("returns override when one exists for today", async () => {
    // First select (overrides) returns a row
    const overrideRow = {
      window_start: "14:00",
      window_end: "16:00",
    };
    const defaultRow = {
      vote_window_start: "09:00",
      vote_window_end: "10:00",
    };

    let callIndex = 0;
    mockDbSelect.mockImplementation(() => {
      const result = callIndex === 0 ? [overrideRow] : [defaultRow];
      callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const window = await resolveVoteWindow("G1", "2026-03-11");
    expect(window).toEqual({ start: "14:00", end: "16:00" });
  });

  it("falls back to default when no override for today", async () => {
    const defaultRow = {
      vote_window_start: "09:00",
      vote_window_end: "10:00",
    };

    let callIndex = 0;
    mockDbSelect.mockImplementation(() => {
      const result = callIndex === 0 ? [] : [defaultRow];
      callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const window = await resolveVoteWindow("G1", "2026-03-11");
    expect(window).toEqual({ start: "09:00", end: "10:00" });
  });

  it("returns null when neither override nor default exists", async () => {
    let callIndex = 0;
    mockDbSelect.mockImplementation(() => {
      const result = callIndex === 0 ? [] : [{ vote_window_start: null, vote_window_end: null }];
      callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const window = await resolveVoteWindow("G1", "2026-03-11");
    expect(window).toBeNull();
  });

  it("returns null when game does not exist", async () => {
    let callIndex = 0;
    mockDbSelect.mockImplementation(() => {
      const result: unknown[] = []; // both override and game not found
      callIndex++;
      const limit = vi.fn().mockResolvedValue(result);
      const where = vi.fn(() => ({ limit }));
      const from = vi.fn(() => ({ where }));
      return { from };
    });

    const window = await resolveVoteWindow("MISSING", "2026-03-11");
    expect(window).toBeNull();
  });
});

// ── isVoteWindowOpen ──────────────────────────────────────────────

describe("isVoteWindowOpen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns false when window is null", () => {
    expect(isVoteWindowOpen(null, "UTC")).toBe(false);
  });

  it("returns true when current time is within the window", () => {
    vi.mocked(nowInZone).mockReturnValue(12 * 60 + 30); // 12:30
    expect(isVoteWindowOpen({ start: "12:00", end: "13:00" }, "UTC")).toBe(true);
  });

  it("returns false when current time is before the window", () => {
    vi.mocked(nowInZone).mockReturnValue(11 * 60 + 0); // 11:00
    expect(isVoteWindowOpen({ start: "12:00", end: "13:00" }, "UTC")).toBe(false);
  });

  it("returns false when current time is at or after window end", () => {
    vi.mocked(nowInZone).mockReturnValue(13 * 60 + 0); // 13:00
    expect(isVoteWindowOpen({ start: "12:00", end: "13:00" }, "UTC")).toBe(false);
  });

  it("handles overnight windows (e.g. 22:00–02:00)", () => {
    vi.mocked(nowInZone).mockReturnValue(23 * 60); // 23:00
    expect(isVoteWindowOpen({ start: "22:00", end: "02:00" }, "UTC")).toBe(true);

    vi.mocked(nowInZone).mockReturnValue(1 * 60); // 01:00
    expect(isVoteWindowOpen({ start: "22:00", end: "02:00" }, "UTC")).toBe(true);

    vi.mocked(nowInZone).mockReturnValue(2 * 60); // 02:00 — at end, not open
    expect(isVoteWindowOpen({ start: "22:00", end: "02:00" }, "UTC")).toBe(false);
  });
});
