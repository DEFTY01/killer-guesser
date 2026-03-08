import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, game_players, games } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { DefaultSession } from "next-auth";
import crypto from "crypto";

// ── Module augmentation: extend NextAuth types ────────────────────

declare module "next-auth" {
  interface User {
    avatar_url?: string | null;
    role?: string;
    activeGameId?: string;
  }
  interface Session {
    user: {
      id: string;
      avatar_url: string | null;
      role: string;
      activeGameId: string;
    } & DefaultSession["user"];
  }
}

/**
 * Auth.js v5 configuration.
 *
 * Two separate Credentials providers:
 *
 * 1. "player" — Avatar-click login flow:
 *    - Receives a userId (no password).
 *    - Verifies the user is active and has an active/scheduled game.
 *    - Returns user object with id, name, avatar_url, role, activeGameId.
 *
 * 2. "admin" — Password-only login flow:
 *    - Receives a password field only.
 *    - Compares against ADMIN_PASSWORD env var using timingSafeEqual.
 *    - Returns a hardcoded admin identity (never stored in the database).
 *
 * JWT strategy — no DrizzleAdapter (users table uses integer PKs).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
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
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        // JWT extends Record<string, unknown>; bracket notation is required
        // because @auth/core/jwt cannot be augmented with the bundler module
        // resolver used in this project.
        token["id"] = user.id;
        token["role"] = user.role ?? "player";
        // Player-only fields — undefined for admin sessions.
        token["avatar_url"] = user.avatar_url ?? null;
        token["activeGameId"] = user.activeGameId ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token["id"] as string | undefined) ?? "";
        session.user.role = (token["role"] as string | undefined) ?? "player";
        // Player-only fields — null / empty for admin sessions.
        session.user.avatar_url =
          (token["avatar_url"] as string | null | undefined) ?? null;
        session.user.activeGameId =
          (token["activeGameId"] as string | undefined) ?? "";
      }
      return session;
    },
  },
});

