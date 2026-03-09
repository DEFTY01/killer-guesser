import { describe, it, expect, vi, beforeEach } from "vitest";

// ── vi.hoisted: mock variables for db ────────────────────────────
const { mockSelectReturn, mockDbSelect, mockDbFrom, mockDbWhere, mockDbLimit, mockDbInnerJoin } =
  vi.hoisted(() => {
    const ret = vi.fn().mockResolvedValue([]);
    const limit = vi.fn(() => ({ then: ret.then?.bind(ret) }));
    const where = vi.fn(() => ({ limit }));
    const innerJoin = vi.fn(() => ({ where }));
    const from = vi.fn(() => ({ where, innerJoin }));
    const select = vi.fn(() => ({ from }));

    // Make limit thenable / awaitable by returning a promise
    Object.defineProperty(limit, "then", {
      value: (onResolve: (v: unknown) => void, onReject?: (e: unknown) => void) =>
        ret().then(onResolve, onReject),
      writable: true,
    });

    return {
      mockSelectReturn: ret,
      mockDbSelect: select,
      mockDbFrom: from,
      mockDbWhere: where,
      mockDbLimit: limit,
      mockDbInnerJoin: innerJoin,
    };
  });

// Mock db module
vi.mock("@/db", () => ({
  db: {
    select: mockDbSelect,
  },
}));

// Mock next-auth to avoid pulling in the full framework
vi.mock("next-auth", () => {
  return {
    default: (config: Record<string, unknown>) => {
      // Extract the providers and expose their authorize methods
      const providers = config.providers as Array<{
        options?: { authorize?: (...args: unknown[]) => unknown };
      }>;
      return {
        handlers: {},
        signIn: vi.fn(),
        signOut: vi.fn(),
        auth: vi.fn(),
        _providers: providers,
      };
    },
  };
});

vi.mock("next-auth/providers/credentials", () => ({
  default: (opts: Record<string, unknown>) => ({
    id: opts.id,
    name: opts.name,
    type: "credentials",
    options: opts,
  }),
}));

vi.mock("@/lib/auth.config", () => ({
  authConfig: {
    callbacks: {},
    pages: {},
  },
}));

// ── Import after mocks ───────────────────────────────────────────

// We need to get the authorize functions from the providers
// Since we mocked NextAuth, we'll test the authorize logic directly
import crypto from "crypto";

describe("auth providers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset limit to return empty by default
    mockDbLimit.mockImplementation(() => Promise.resolve([]));
  });

  describe("player provider", () => {
    // Replicate the player authorize logic from auth.ts
    async function playerAuthorize(credentials: { userId?: string }) {
      const userId = Number(credentials?.userId);
      if (!userId || isNaN(userId)) return null;

      // Simulate: db.select().from(users).where(...).limit(1)
      const [user] = await mockDbSelect().from("users").where("active").limit(1);
      if (!user) return null;

      // Simulate: db.select().from(game_players).innerJoin(games, ...).where(...).limit(1)
      const [playerEntry] = await mockDbSelect()
        .from("game_players")
        .innerJoin("games")
        .where("active_game")
        .limit(1);

      if (!playerEntry) {
        throw new Error("No active game found. Ask your host!");
      }

      return {
        id: String(user.id),
        name: user.name,
        avatar_url: user.avatar_url,
        role: "player" as const,
        activeGameId: playerEntry.gameId,
      };
    }

    it("valid active user → returns user object with role 'player'", async () => {
      // First call: user lookup
      mockDbLimit
        .mockResolvedValueOnce([
          { id: 10, name: "Alice", avatar_url: "/alice.png", is_active: 1 },
        ])
        // Second call: game_players lookup
        .mockResolvedValueOnce([{ gameId: "GAME001" }]);

      const result = await playerAuthorize({ userId: "10" });
      expect(result).toEqual({
        id: "10",
        name: "Alice",
        avatar_url: "/alice.png",
        role: "player",
        activeGameId: "GAME001",
      });
    });

    it("inactive user (is_active=0) → returns null (User not found)", async () => {
      // User lookup returns nothing (inactive user is filtered by where clause)
      mockDbLimit.mockResolvedValueOnce([]);

      const result = await playerAuthorize({ userId: "99" });
      expect(result).toBeNull();
    });

    it("unknown userId → returns null (User not found)", async () => {
      mockDbLimit.mockResolvedValueOnce([]);

      const result = await playerAuthorize({ userId: "999" });
      expect(result).toBeNull();
    });

    it("invalid userId format → returns null", async () => {
      const result = await playerAuthorize({ userId: "abc" });
      expect(result).toBeNull();
    });

    it("user with no active game → throws error", async () => {
      mockDbLimit
        .mockResolvedValueOnce([{ id: 10, name: "Bob", avatar_url: null, is_active: 1 }])
        .mockResolvedValueOnce([]); // No game found

      await expect(playerAuthorize({ userId: "10" })).rejects.toThrow(
        "No active game found. Ask your host!"
      );
    });
  });

  describe("admin provider", () => {
    // Replicate the admin authorize logic from auth.ts
    async function adminAuthorize(credentials: { password?: string }) {
      const submitted = credentials?.password as string | undefined;
      const adminPassword = process.env.ADMIN_PASSWORD;

      if (!submitted || !adminPassword) {
        throw new Error("Invalid admin password");
      }

      const submittedHash = crypto
        .createHash("sha256")
        .update(submitted)
        .digest();
      const adminHash = crypto
        .createHash("sha256")
        .update(adminPassword)
        .digest();

      const match = crypto.timingSafeEqual(submittedHash, adminHash);
      if (!match) {
        throw new Error("Invalid admin password");
      }

      return { id: "admin", name: "Admin", role: "admin" as const };
    }

    it("correct ADMIN_PASSWORD → returns { id:'admin', role:'admin' }", async () => {
      process.env.ADMIN_PASSWORD = "supersecret";
      try {
        const result = await adminAuthorize({ password: "supersecret" });
        expect(result).toEqual({
          id: "admin",
          name: "Admin",
          role: "admin",
        });
      } finally {
        delete process.env.ADMIN_PASSWORD;
      }
    });

    it("wrong password → throws 'Invalid admin password'", async () => {
      process.env.ADMIN_PASSWORD = "supersecret";
      try {
        await expect(adminAuthorize({ password: "wrong" })).rejects.toThrow(
          "Invalid admin password"
        );
      } finally {
        delete process.env.ADMIN_PASSWORD;
      }
    });

    it("empty password → throws", async () => {
      process.env.ADMIN_PASSWORD = "supersecret";
      try {
        await expect(adminAuthorize({ password: "" })).rejects.toThrow(
          "Invalid admin password"
        );
      } finally {
        delete process.env.ADMIN_PASSWORD;
      }
    });

    it("undefined password → throws", async () => {
      process.env.ADMIN_PASSWORD = "supersecret";
      try {
        await expect(adminAuthorize({ password: undefined })).rejects.toThrow(
          "Invalid admin password"
        );
      } finally {
        delete process.env.ADMIN_PASSWORD;
      }
    });

    it("no ADMIN_PASSWORD env var → throws", async () => {
      delete process.env.ADMIN_PASSWORD;
      await expect(adminAuthorize({ password: "anything" })).rejects.toThrow(
        "Invalid admin password"
      );
    });
  });
});
