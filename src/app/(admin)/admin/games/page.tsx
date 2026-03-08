import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, game_players } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type { GameStatus } from "@/types";
import { requireAdmin } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Games" };

function StatusBadge({ status }: { status: GameStatus }) {
  const styles: Record<GameStatus, string> = {
    scheduled: "bg-yellow-50 text-yellow-700 border-yellow-200",
    active: "bg-green-50 text-green-700 border-green-200",
    closed: "bg-gray-50 text-gray-600 border-gray-200",
    deleted: "bg-red-50 text-red-400 border-red-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}

export default async function GamesPage() {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const allGames = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      created_at: games.created_at,
      player_count: sql<number>`count(${game_players.id})`.as("player_count"),
    })
    .from(games)
    .leftJoin(game_players, eq(games.id, game_players.game_id))
    .groupBy(games.id)
    .orderBy(desc(games.created_at));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Games</h1>
        <Link
          href="/admin/games/new"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          + New Game
        </Link>
      </div>

      {allGames.length === 0 ? (
        <p className="text-sm text-gray-500">No games yet.</p>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Code
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Players
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Start
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {allGames.map((game) => (
                <tr
                  key={game.id}
                  className="border-b last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 font-mono font-medium">
                    <Link
                      href={`/admin/games/${game.id}`}
                      className="text-indigo-600 hover:text-indigo-800 hover:underline"
                    >
                      {game.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-gray-900 font-medium">
                    {game.name}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={game.status} />
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {game.player_count}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(game.start_time * 1000).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(game.created_at * 1000).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
