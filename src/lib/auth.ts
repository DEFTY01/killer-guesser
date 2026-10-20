import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { verifyPlayerLogin } from "@/lib/playerLogin";
import crypto from "crypto";
import { authConfig } from "./auth.config";

/**
 * Auth.js v5 configuration — Node.js runtime only.
 *
 * Spreads the edge-safe authConfig (JWT/session callbacks, pages) and adds
 * the two Credentials providers that require Node.js + database access:
 *
 * 1. "player" — Game code + avatar + per-game PIN.
 * 2. "admin"  — Password-only login flow (timingSafeEqual via Node crypto).
 */
export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  providers: [
    // ── Provider 1: player ────────────────────────────────────────
    Credentials({
      id: "player",
      name: "Game code login",
      credentials: {
        gameCode: { label: "Game code", type: "text" },
        userId: { label: "User ID", type: "text" },
        pin: { label: "PIN", type: "password" },
      },
      async authorize(credentials) {
        return verifyPlayerLogin({
          gameCode: String(credentials?.gameCode ?? ""),
          userId: Number(credentials?.userId),
          pin: String(credentials?.pin ?? ""),
        });
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

