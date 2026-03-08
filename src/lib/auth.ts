import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/db";
import { users } from "@/db/schema";
import { adminLoginSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

/**
 * Auth.js v5 configuration.
 *
 * Supports two flows:
 *  1. Admin session — credentials-based login (JWT strategy, no DB adapter).
 *  2. Player session — handled separately via avatar/session API routes.
 *
 * Note: DrizzleAdapter is not used here because the `users` table uses
 * integer primary keys and does not carry Auth.js OAuth columns. Admin
 * authentication is JWT-only.
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  session: { strategy: "jwt" },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login",
  },
  providers: [
    Credentials({
      name: "Admin credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const parsed = adminLoginSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const { email } = parsed.data;

        // Look up admin user by name. In production, verify a hashed
        // password stored on the user record. The email field from the
        // login form is matched against users.name for the initial scaffold.
        const [user] = await db
          .select()
          .from(users)
          .where(eq(users.name, email))
          .limit(1);

        if (!user || user.role !== "admin") return null;

        return { id: String(user.id), name: user.name };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (token?.id && session.user) {
        (session.user as typeof session.user & { id: string }).id =
          token.id as string;
      }
      return session;
    },
  },
});
