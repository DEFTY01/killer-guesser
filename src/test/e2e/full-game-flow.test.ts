import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

/**
 * Full game flow (API-level) E2E test.
 *
 * Seed: 1 game (active), 6 players (1 killer, 2 survivors, 1 seer, 1 healer, 1 spy).
 * Tests the full lifecycle: board access, voting, and game end.
 */

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth, mockHandleKillerDefeated } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockHandleKillerDefeated: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/gameEnd", () => ({ handleKillerDefeated: mockHandleKillerDefeated }));

vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn().mockResolvedValue(undefined) })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed", game_ended: "game_ended", player_died: "player_died", player_revived: "player_revived" },
}));

vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
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
      const orderBy = vi.fn().mockResolvedValue(result);
      const groupBy = vi.fn(() => ({ orderBy: vi.fn().mockResolvedValue(result) }));
      const where = vi.fn(() => {
        const p = Promise.resolve(result);
        return Object.assign(p, { limit, orderBy, groupBy });
      });
      const leftJoin = vi.fn(() => ({ where, orderBy }));
      const innerJoin = vi.fn(() => ({ where, leftJoin, orderBy, groupBy }));
      const from = vi.fn(() => ({ where, leftJoin, innerJoin, orderBy, groupBy }));
      return { from };
    }),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({ returning: vi.fn().mockResolvedValue([{ id: 1 }]) })),
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
  roles: { id: "id", name: "name", color_hex: "color_hex", permissions: "permissions" },
  games: { id: "id", name: "name", status: "status", start_time: "st", team1_name: "t1", team2_name: "t2", vote_window_start: "vws", vote_window_end: "vwe" },
  game_players: { id: "id", game_id: "gid", user_id: "uid", team: "team", is_dead: "dead", revived_at: "ra", role_id: "rid", has_tipped: "ht" },
  game_settings: { game_id: "gid", murder_item_url: "miu", murder_item_name: "min" },
  votes: { id: "id", game_id: "gid", day: "day", voter_id: "vid", target_id: "tid" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  and: vi.fn(),
  sql: vi.fn(),
  count: vi.fn(),
}));

import { GET as getBoard } from "@/app/api/game/[id]/board/route";
import { POST as postVote } from "@/app/api/game/[id]/vote/route";

const GAME_START = Math.floor(Date.now() / 1000) - 86400;

const makeGameData = () => ({
  id: "GAME01",
  name: "Test Game",
  status: "active",
  start_time: GAME_START,
  team1_name: "Killers",
  team2_name: "Survivors",
  vote_window_start: null as string | null,
  vote_window_end: null as string | null,
});

const allPlayers = [
  { id: 1, user_id: 1, name: "Killer", avatar_url: null, team: "team1", is_dead: 0, revived_at: null, role_color: "#FF0000" },
  { id: 2, user_id: 2, name: "Survivor1", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#00FF00" },
  { id: 3, user_id: 3, name: "Survivor2", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#00FF00" },
  { id: 4, user_id: 4, name: "Seer", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#0000FF" },
  { id: 5, user_id: 5, name: "Healer", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#00FFFF" },
  { id: 6, user_id: 6, name: "Spy", avatar_url: null, team: "team2", is_dead: 0, revived_at: null, role_color: "#FFFF00" },
];

describe("full-game-flow (API-level)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dbState.callIndex = 0;
    dbState.selectResults = [];
    delete process.env.ABLY_API_KEY;
  });

  it("GET /board as killer → no killerId in response", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "player" } });

    dbState.selectResults = [
      [makeGameData()],
      [{ murder_item_url: null, murder_item_name: null }],
      [{ game_player_id: 1, permissions: null, role_name: "Killer", is_dead: 0, revived_at: null, has_tipped: 0 }],
      allPlayers,
    ];

    const req = new NextRequest("http://localhost/api/game/GAME01/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "GAME01" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.killer_id).toBeUndefined();
  });

  it("GET /board as seer → killerId present", async () => {
    mockAuth.mockResolvedValue({ user: { id: "4", role: "player" } });

    dbState.selectResults = [
      [makeGameData()],
      [{ murder_item_url: null, murder_item_name: null }],
      [{ game_player_id: 4, permissions: '["see_killer"]', role_name: "Seer", is_dead: 0, revived_at: null, has_tipped: 0 }],
      allPlayers,
      [{ user_id: 1 }], // Killer lookup
    ];

    const req = new NextRequest("http://localhost/api/game/GAME01/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "GAME01" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.killer_id).toBe(1);
  });

  it("POST /vote as alive player within window → 200", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "player" } });

    const now = new Date();
    const startH = String(now.getUTCHours()).padStart(2, "0");
    const startM = String(now.getUTCMinutes()).padStart(2, "0");
    const endH = String((now.getUTCHours() + 1) % 24).padStart(2, "0");

    dbState.selectResults = [
      [{ ...makeGameData(), vote_window_start: `${startH}:${startM}`, vote_window_end: `${endH}:${startM}` }],
      [{ id: 2, is_dead: 0, revived_at: null }],
      [], // no existing vote
      [{ name: "Survivor1", avatar_url: null }],
      [{ name: "Killer", avatar_url: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/GAME01/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "GAME01" }) });

    expect(res.status).toBe(200);
  });

  it("POST /vote as killer voting for themselves → 200 (self-vote allowed)", async () => {
    mockAuth.mockResolvedValue({ user: { id: "1", role: "player" } });

    const now = new Date();
    const startH = String(now.getUTCHours()).padStart(2, "0");
    const startM = String(now.getUTCMinutes()).padStart(2, "0");
    const endH = String((now.getUTCHours() + 1) % 24).padStart(2, "0");

    dbState.selectResults = [
      [{ ...makeGameData(), vote_window_start: `${startH}:${startM}`, vote_window_end: `${endH}:${startM}` }],
      [{ id: 1, is_dead: 0, revived_at: null }],
      [], // no existing vote
      [{ name: "Killer", avatar_url: null }],
      [{ name: "Killer", avatar_url: null }],
    ];

    const req = new NextRequest("http://localhost/api/game/GAME01/vote", {
      method: "POST",
      body: JSON.stringify({ targetId: 1 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await postVote(req, { params: Promise.resolve({ id: "GAME01" }) });

    expect(res.status).toBe(200);
  });

  it("GET /board after game closed → players still returned, game status closed", async () => {
    mockAuth.mockResolvedValue({ user: { id: "2", role: "player" } });

    dbState.selectResults = [
      [{ ...makeGameData(), status: "closed" }],
      [{ murder_item_url: null, murder_item_name: null }],
      [{ game_player_id: 2, permissions: null, role_name: "Survivor", is_dead: 0, revived_at: null, has_tipped: 0 }],
      allPlayers,
    ];

    const req = new NextRequest("http://localhost/api/game/GAME01/board");
    const res = await getBoard(req, { params: Promise.resolve({ id: "GAME01" }) });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.data.players).toHaveLength(6);
  });
});
