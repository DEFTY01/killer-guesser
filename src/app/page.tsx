import type { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import LoginScreen from "@/components/auth/LoginScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Summit of Lies" };

/**
 * Home page — server component that fetches all active players and passes
 * them directly to LoginScreen so the player-selection panel opens inline
 * instead of navigating to /login.
 */
export default async function HomePage() {
  let allPlayers: { id: string; nickname: string; avatarUrl: string | null }[] = [];
  try {
    allPlayers = await db
      .select({
        id: users.id,
        nickname: users.name,
        avatarUrl: users.avatar_url,
      })
      .from(users)
      .where(eq(users.is_active, 1))
      .then((rows) => rows.map((r) => ({ ...r, id: String(r.id) })));
  } catch {
    // Non-fatal: render with empty list so the page doesn't 500.
  }

  return <LoginScreen players={allPlayers} />;
}
