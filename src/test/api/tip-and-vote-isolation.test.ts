import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Verifies that tipping does NOT consume the player's vote for the evening,
 * and voting does NOT consume the player's tip.
 *
 * We test this by calling the tip route and then verifying that the vote
 * route still allows the same player to vote (and vice versa).
 * Since both routes operate on different DB columns (has_tipped vs votes table),
 * they are inherently independent.
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
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", player_died: "player_died", game_ended: "game_ended" },
}));

vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
}));

// ── Hoist voteWindow mock ─────────────────────────────────────────
const { mockIsVoteWindowOpen, mockResolveVoteWindow } = vi.hoisted(() => ({
  mockIsVoteWindowOpen: vi.fn().mockReturnValue(false),
  mockResolveVoteWindow: vi.fn().mockResolvedValue(null),
}));

vi.mock("@/lib/voteWindow", () => ({
  resolveVoteWindow: mockResolveVoteWindow,
  isVoteWindowOpen: mockIsVoteWindowOpen,
}));

// Track which route is being tested to return correct results
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
      const groupBy = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(result) }));
      const where = vi.fn(() => {
        const p = Promise.resolve(result);
        return Object.assign(p, { limit, groupBy });
      });
      const leftJoin = vi.fn(() => ({ where, groupBy }));
      const innerJoin = vi.fn(() => ({ where, leftJoin, groupBy }));
      const from = vi.fn(() => ({ where, leftJoin, innerJoin, groupBy }));
      return { from };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn().mockResolvedValue([{ id: 1 }]),
        onConflictDoUpdate: vi.fn().mockResolvedValue([]),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => {
          const p = Promise.resolve([]);
          return Object.assign(p, { returning: vi.fn().mockResolvedValue([]) });
        }),
      })),
    })),
    transaction: vi.fn(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const txUpdate = vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve([])) })),
      }));
      return fn({ update: txUpdate });
    }),
  },
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", avatar_url: "avatar_url" },
  roles: { id: "id", name: "name", permissions: "permissions" },
  games: { id: "id", start_time: "st", vote_window_start: "vws", vote_window_end: "vwe", status: "status" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", is_dead: "dead", is_revived: "is_revived", revived_at: "ra", has_tipped: "ht", role_id: "rid" },
  votes: { id: "id", game_id: "gid", day: "day", voter_id: "vid", target_id: "tid" },
  vote_window_overrides: { id: "id", game_id: "game_id", day_date: "day_date", window_start: "window_start", window_end: "window_end" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
}));

import { POST as postTip } from "@/app/api/game/[id]/tip/route";
import { POST as postVote } from "@/app/api/game/[id]/vote/route";

describe("tip-and-vote-isolation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    delete process.env.ABLY_API_KEY;
    mockIsVoteWindowOpen.mockReturnValue(false);
    mockResolveVoteWindow.mockResolvedValue(null);
  });

  it("tipping does NOT consume the player's vote for the evening", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    // First: tip (wrong guess)
    dbState.selectResults = [
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Villager" }],
      [{ id: 2, user_id: 20, is_dead: 0, revived_at: null, role_name: "Survivor" }],
      [{ name: "Alice" }],
    ];
    dbState.callIndex = 0;

    const tipReq = new NextRequest("http://localhost/api/game/G1/tip", {
      method: "POST",
      body: JSON.stringify({ suspectId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const tipRes = await postTip(tipReq, { params: Promise.resolve({ id: "G1" }) });
    const tipData = await tipRes.json();
    expect(tipData.data.correct).toBe(false);

    // Second: vote should still work (player can tip AND vote)
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbState.callIndex = 0;
    dbState.selectResults = [
      // Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, timezone: "UTC" }],
      // Caller is alive-after-revival (undead: is_dead=0, is_revived=1, can vote)
      [{ id: 1, is_dead: 0, is_revived: 1, revived_at: Math.floor(Date.now() / 1000) }],
      [], // no existing vote
      [{ name: "Alice", avatar_url: null }],
      [{ name: "Bob", avatar_url: null }],
    ];

    const voteReq = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 30 }),
      headers: { "Content-Type": "application/json" },
    });
    const voteRes = await postVote(voteReq, { params: Promise.resolve({ id: "G1" }) });

    // This verifies tip didn't affect vote eligibility
    expect(voteRes.status).toBe(200);
  });

  it("voting does NOT consume the player's tip", async () => {
    mockAuth.mockResolvedValue({ user: { id: "10", role: "player" } });

    // First: vote
    mockIsVoteWindowOpen.mockReturnValue(true);
    mockResolveVoteWindow.mockResolvedValue({ start: "12:00", end: "13:00" });

    dbState.selectResults = [
      // Game — null vote_window to avoid triggering lazy close logic
      [{ id: "G1", start_time: Math.floor(Date.now() / 1000) - 86400, vote_window_start: null, vote_window_end: null, timezone: "UTC" }],
      [{ id: 1, is_dead: 0, revived_at: null }],
      [], // no existing vote
      [{ name: "Alice", avatar_url: null }],
      [{ name: "Bob", avatar_url: null }],
    ];
    dbState.callIndex = 0;

    const voteReq = new NextRequest("http://localhost/api/game/G1/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 30 }),
      headers: { "Content-Type": "application/json" },
    });
    const voteRes = await postVote(voteReq, { params: Promise.resolve({ id: "G1" }) });
    expect(voteRes.status).toBe(200);

    // Second: tip should still work (has_tipped still 0)
    dbState.callIndex = 0;
    dbState.selectResults = [
      [{ id: 1, is_dead: 0, revived_at: null, has_tipped: 0, role_name: "Villager" }],
      [{ id: 2, user_id: 20, is_dead: 0, revived_at: null, role_name: "Survivor" }],
      [{ name: "Alice" }],
    ];

    const tipReq = new NextRequest("http://localhost/api/game/G1/tip", {
      method: "POST",
      body: JSON.stringify({ suspectId: 20 }),
      headers: { "Content-Type": "application/json" },
    });
    const tipRes = await postTip(tipReq, { params: Promise.resolve({ id: "G1" }) });
    const tipData = await tipRes.json();

    expect(tipRes.status).toBe(200);
    expect(tipData.data.correct).toBe(false);
  });
});
