import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, game_players, games } from "@/db/schema";
import { and, eq, or } from "drizzle-orm";
import type { DefaultSession } from "next-auth";

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
 * Single avatar-click login flow:
 *  - The login page sends the player's userId (no password).
 *  - The authorize function verifies the user is active and has an
 *    active or scheduled game, then returns the full user object.
 *  - JWT strategy — no DrizzleAdapter (users table uses integer PKs).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [
    Credentials({
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
          role: user.role,
          activeGameId: playerEntry.gameId,
        };
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
        token["avatar_url"] = user.avatar_url ?? null;
        token["role"] = user.role ?? "member";
        token["activeGameId"] = user.activeGameId ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token["id"] as string | undefined) ?? "";
        session.user.avatar_url =
          (token["avatar_url"] as string | null | undefined) ?? null;
        session.user.role = (token["role"] as string | undefined) ?? "member";
        session.user.activeGameId =
          (token["activeGameId"] as string | undefined) ?? "";
      }
      return session;
    },
  },
});

