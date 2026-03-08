import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, game_players, games } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import crypto from "crypto";
import { authConfig } from "./auth.config";

/**
 * Auth.js v5 configuration — Node.js runtime only.
 *
 * Spreads the edge-safe authConfig (JWT/session callbacks, pages) and adds
 * the two Credentials providers that require Node.js + database access:
 *
 * 1. "player" — Avatar-click login flow.
 * 2. "admin"  — Password-only login flow (timingSafeEqual via Node crypto).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    // ── Provider 1: player ────────────────────────────────────────
    Credentials({
      id: "player",
      name: "Avatar login",
      credentials: {
        userId: { label: "User ID", type: "text" },
      },
      async authorize(credentials) {
        const userId = Number(credentials?.userId);
        if (!userId || isNaN(userId)) return null;

        // Verify user exists and is active.
        const [user] = await db
          .select()
          .from(users)
          .where(and(eq(users.id, userId), eq(users.is_active, 1)))
          .limit(1);

        if (!user) return null;

        // Find an active or scheduled game this player belongs to.
        const [playerEntry] = await db
          .select({ gameId: game_players.game_id })
          .from(game_players)
          .innerJoin(games, eq(game_players.game_id, games.id))
          .where(
            and(
              eq(game_players.user_id, userId),
              or(eq(games.status, "active"), eq(games.status, "scheduled")),
            ),
          )
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
      },
    }),

    // ── Provider 2: admin ─────────────────────────────────────────
    Credentials({
      id: "admin",
      name: "Admin login",
      credentials: {
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const submitted = credentials?.password as string | undefined;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!submitted || !adminPassword) {
          throw new Error("Invalid admin password");
        }

        // Hash both values to ensure equal buffer length before using
        // timingSafeEqual, preventing password-length timing side-channels.
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

        // Return a hardcoded admin identity — never stored in the database.
        return { id: "admin", name: "Admin", role: "admin" as const };
      },
    }),
  ],
});

