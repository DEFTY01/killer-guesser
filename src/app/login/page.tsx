import type { Metadata } from "next";
import { db } from "@/db";
import { users } from "@/db/schema";
import LoginScreen from "@/components/auth/LoginScreen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Enter the Game" };

/**
 * Thin server component: fetches all players and passes them to the
 * client-side LoginScreen for the single-page avatar-picker login flow.
 *
 * The schema has no `is_active` flag; all player records are shown.
 */
export default async function LoginPage() {
  const allPlayers = await db
    .select({
      id: users.id,
      nickname: users.name,
      avatarUrl: users.avatar_url,
    })
    .from(users)
    .then((rows) => rows.map((r) => ({ ...r, id: String(r.id) })));

  return <LoginScreen players={allPlayers} />;
}
