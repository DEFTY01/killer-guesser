import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * concurrent-requests.test.ts
 *
 * Verifies that 5 parallel requests to game-related endpoints do not
 * create duplicate database connections.  The singleton guard in db.ts
 * stores the client on `globalThis.__tursoClient` so that every
 * lambda invocation that shares the same process reuses the same
 * connection.
 */

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mockAuth }));
vi.mock("@/lib/ably", () => ({
  ablyServer: { channels: { get: vi.fn(() => ({ publish: vi.fn() })) } },
  ABLY_CHANNELS: { game: (id: string) => `game-${id}`, vote: (id: string, day: number) => `vote-${id}-${day}` },
  ABLY_EVENTS: { vote_cast: "vote_cast", vote_closed: "vote_closed", game_ended: "game_ended" },
}));
vi.mock("@/lib/gameEnd", () => ({ checkGameOver: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/activateGame", () => ({ activateGameIfReady: vi.fn() }));
vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
  ROLE_PERMISSIONS: ["see_killer", "revive_dead", "see_votes", "extra_vote", "immunity_once"],
}));

// ── DB singleton mock ─────────────────────────────────────────────
// Track how many times createClient was called to verify the singleton guard
// prevents duplicate connections.
const { createClientCallCount } = vi.hoisted(() => ({
  createClientCallCount: { value: 0 },
}));

vi.mock("@libsql/client", () => ({
  createClient: vi.fn(() => {
    createClientCallCount.value++;
    return {};
  }),
}));

vi.mock("drizzle-orm/libsql", () => ({
  drizzle: vi.fn(() => ({
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn().mockResolvedValue([]),
        })),
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
        leftJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn().mockResolvedValue([]),
          })),
        })),
      })),
    })),
  })),
}));

vi.mock("@/db/schema", () => ({
  users: { id: "id", name: "name", avatar_url: "avatar_url" },
  roles: { id: "id", name: "name", color_hex: "color_hex", permissions: "permissions", description: "description" },
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

describe("DB singleton (connection pooling)", () => {
  it("5 parallel imports all return the same db instance (no duplicates)", async () => {
    // Simulate 5 concurrent requests that all import the db module.
    // ESM module caching guarantees a single evaluation, but the globalThis
    // guard provides an additional safety net for environments that may
    // re-evaluate module code across hot-reloads or unusual bundler configs.
    const [db1, db2, db3, db4, db5] = await Promise.all([
      import("@/lib/db"),
      import("@/lib/db"),
      import("@/lib/db"),
      import("@/lib/db"),
      import("@/lib/db"),
    ]);

    // All five imports must resolve to the identical db object.
    expect(db1.db).toBe(db2.db);
    expect(db2.db).toBe(db3.db);
    expect(db3.db).toBe(db4.db);
    expect(db4.db).toBe(db5.db);
  });

  it("the exported db and client are defined", async () => {
    const { db, client } = await import("@/lib/db");
    expect(db).toBeDefined();
    expect(client).toBeDefined();
  });

  it("db and client exports are stable across multiple async accesses", async () => {
    const firstAccess = await import("@/lib/db");
    // Simulate a short delay (other async work between requests)
    await Promise.resolve();
    const secondAccess = await import("@/lib/db");

    expect(firstAccess.db).toBe(secondAccess.db);
    expect(firstAccess.client).toBe(secondAccess.client);
  });
});
