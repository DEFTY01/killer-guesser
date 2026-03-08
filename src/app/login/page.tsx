import type { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import LoginScreen from "@/components/auth/LoginScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enter the Game" };

/**
 * Thin server component: fetches all active players from the users table
 * and passes them to the client-side LoginScreen for the single-page
 * avatar-picker login flow.
 */
export default async function LoginPage() {
  const allPlayers = await db
    .select({
      id: users.id,
      name: users.name,
      avatar_url: users.avatar_url,
    })
    .from(users)
    .where(eq(users.is_active, 1));

  // Map to the shape LoginScreen expects
  const players = allPlayers.map((u) => ({
    id: String(u.id),
    nickname: u.name,
    avatarUrl: u.avatar_url,
  }));

  return <LoginScreen players={players} />;
}
