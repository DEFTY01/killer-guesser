import type { Metadata } from "next";
import { db } from "@/db";
import { players } from "@/db/schema";
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
      id: players.id,
      nickname: players.nickname,
      avatarUrl: players.avatarUrl,
    })
    .from(players);

  return <LoginScreen players={allPlayers} />;
}
