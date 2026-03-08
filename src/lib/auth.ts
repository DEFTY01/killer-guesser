import NextAuth from "next-auth";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users, players } from "@/db/schema";
import { adminLoginSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

/**
 * Auth.js v5 configuration.
 *
 * Supports two flows:
 *  1. Admin session — email/password credentials (or OAuth providers).
 *  2. Player session — userId credential from the avatar-picker login page.
 *
 * JWT session strategy is used; no session records are written to the database.
 * The synthetic email used for player sessions is stored only in the JWT and is
 * never exposed to users or used for any email-based auth flow.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: DrizzleAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [
    Credentials({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        userId: { label: "User ID", type: "text" },
      },
      async authorize(credentials) {
        // Player login path — userId provided without email
        if (credentials?.userId && !credentials?.email) {
          const userId = credentials.userId as string;
          const [player] = await db
            .select()
            .from(players)
            .where(eq(players.id, userId))
            .limit(1);
          if (!player) return null;
          return {
            id: player.id,
            name: player.nickname,
            // NextAuth requires an email field; use a synthetic value
            email: `player_${player.id}@killer.local`,
            role: "member",
          };
        }

        // Admin login path — email + password
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email } = parsed.data;

        // In production, verify the hashed password here.
        // This scaffold checks only that the user record exists.
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.email, email))
          .limit(1);

        if (!user) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role ?? "admin",
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as typeof user & { role?: string }).role;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id && session.user) {
        const u = session.user as typeof session.user & {
          id: string;
          role?: string;
        };
        u.id = token.id as string;
        u.role = token.role as string | undefined;
      }
      return session;
    },
  },
});
