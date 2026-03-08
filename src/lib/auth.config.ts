import type { NextAuthConfig } from "next-auth";
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
 * Edge-compatible Auth.js config.
 *
 * Contains only the JWT/session callbacks and page routes — no Node.js
 * built-ins, no database access.  Used by both:
 *  - proxy.ts       (Edge Runtime)
 *  - auth.ts        (Node.js runtime — spreads this and adds providers)
 */
export const authConfig = {
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
    error: "/login",
  },
  providers: [],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token["id"] = user.id;
        token["role"] = user.role ?? "player";
        token["avatar_url"] = user.avatar_url ?? null;
        token["activeGameId"] = user.activeGameId ?? "";
      }
      return token;
    },
    session({ session, token }) {
      if (token && session.user) {
        session.user.id = (token["id"] as string | undefined) ?? "";
        session.user.role = (token["role"] as string | undefined) ?? "player";
        session.user.avatar_url =
          (token["avatar_url"] as string | null | undefined) ?? null;
        session.user.activeGameId =
          (token["activeGameId"] as string | undefined) ?? "";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
