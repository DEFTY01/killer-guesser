import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, game_settings, game_players, roles, users } from "@/db/schema";
import { asc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound, redirect } from "next/navigation";
import GameEditorClient from "./GameEditorClient";

export const metadata: Metadata = { title: "Game Editor" };

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const { id } = await params;

  const [game] = await db.select().from(games).where(eq(games.id, id)).limit(1);
  if (!game) notFound();

  const [[settings], players, allRoles] = await Promise.all([
    db
      .select()
      .from(game_settings)
      .where(eq(game_settings.game_id, id))
      .limit(1),
    db
      .select({
        id: game_players.id,
        game_id: game_players.game_id,
        user_id: game_players.user_id,
        team: game_players.team,
        role_id: game_players.role_id,
        is_dead: game_players.is_dead,
        died_at: game_players.died_at,
        has_tipped: game_players.has_tipped,
        name: users.name,
        avatar_url: users.avatar_url,
        role_name: roles.name,
        role_color: roles.color_hex,
        role_team: roles.team,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .leftJoin(roles, eq(game_players.role_id, roles.id))
      .where(eq(game_players.game_id, id)),
    db
      .select({
        id: roles.id,
        name: roles.name,
        color_hex: roles.color_hex,
        team: roles.team,
      })
      .from(roles)
      .orderBy(asc(roles.name)),
  ]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/games"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Games
        </Link>
        <span className="text-gray-300" aria-hidden="true">
          /
        </span>
        <span className="text-sm font-mono text-gray-500">{id}</span>
      </div>

      <GameEditorClient
        game={game}
        settings={settings ?? null}
        initialPlayers={players}
        allRoles={allRoles}
      />
    </div>
  );
}
