import type { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import LoginScreen from "@/components/auth/LoginScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enter the Game" };

/**
 * Thin server component: fetches all active players (is_active = 1) and
 * passes them to the client-side LoginScreen for the single-page
 * avatar-picker login flow.
 */
export default async function LoginPage() {
  const allPlayers = await db
    .select({
      id: users.id,
      nickname: users.name,
      avatarUrl: users.avatar_url,
    })
    .from(users)
    .where(eq(users.is_active, 1))
    .then((rows) => rows.map((r) => ({ ...r, id: String(r.id) })));

  return <LoginScreen players={allPlayers} />;
}
