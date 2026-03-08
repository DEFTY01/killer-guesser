import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, players } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";
import type { GameStatus } from "@/types";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const [totalPlayers, activeGames, totalGames, recentGames] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(players)
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .where(eq(games.status, "active"))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .then((r) => r[0]?.count ?? 0),
      db.select().from(games).orderBy(desc(games.createdAt)).limit(5),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Dashboard</h1>

      {/* Stats cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <StatCard title="Total Players" value={totalPlayers} />
        <StatCard title="Active Games" value={activeGames} />
        <StatCard title="Total Games" value={totalGames} />
      </div>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-heading" className="mb-8">
        <h2
          id="quick-actions-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3"
        >
          Quick Actions
        </h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/players/new"
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
          >
            + New Player
          </Link>
          <Link
            href="/admin/games/new"
            className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
          >
            + New Game
          </Link>
        </div>
      </section>

      {/* Recent games */}
      <section aria-labelledby="recent-games-heading">
        <h2
          id="recent-games-heading"
          className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3"
        >
          Recent Games
        </h2>
        {recentGames.length === 0 ? (
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
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentGames.map((game) => (
                  <tr
                    key={game.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-mono font-medium">
                      {game.code}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(game.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="mt-2 text-4xl font-bold text-gray-900">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: GameStatus }) {
  const styles: Record<GameStatus, string> = {
    waiting: "bg-yellow-50 text-yellow-700 border-yellow-200",
    active: "bg-green-50 text-green-700 border-green-200",
    finished: "bg-gray-50 text-gray-600 border-gray-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
