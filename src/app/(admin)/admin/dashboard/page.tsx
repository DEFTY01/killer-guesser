import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, users, app_settings } from "@/db/schema";
import { sql, eq, desc } from "drizzle-orm";
import type { GameStatus } from "@/types";
import ThemeSettingsClient from "./ThemeSettingsClient";

export const metadata: Metadata = { title: "Dashboard" };

export default async function AdminDashboard() {
  const [totalPlayers, activeGames, totalGames, recentGames, themeSettings] =
    await Promise.all([
      db
        .select({ count: sql<number>`count(*)` })
        .from(users)
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
      db.select().from(games).orderBy(desc(games.created_at)).limit(5),
      db
        .select()
        .from(app_settings)
        .where(eq(app_settings.id, 1))
        .limit(1)
        .then((r) => r[0] ?? null),
    ]);

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Dashboard</h1>

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
          className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3"
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

      {/* Theme Settings */}
      <ThemeSettingsClient
        initialLightUrl={themeSettings?.bg_light_url ?? null}
        initialDarkUrl={themeSettings?.bg_dark_url ?? null}
      />

      {/* Recent games */}
      <section aria-labelledby="recent-games-heading">
        <h2
          id="recent-games-heading"
          className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3"
        >
          Recent Games
        </h2>
        {recentGames.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">No games yet.</p>
        ) : (
          <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Code
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {recentGames.map((game) => (
                  <tr
                    key={game.id}
                    className="border-b border-gray-200 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  >
                    <td className="px-4 py-3 font-mono font-medium text-gray-900 dark:text-gray-100">
                      {game.id}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status} />
                    </td>
                    <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                      {new Date(game.created_at * 1000).toLocaleDateString()}
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
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
      <p className="mt-2 text-4xl font-bold text-gray-900 dark:text-white">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: GameStatus }) {
  const styles: Record<GameStatus, string> = {
    scheduled: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800/50",
    active: "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800/50",
    closed: "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-600",
    deleted: "bg-red-50 dark:bg-red-900/20 text-red-400 dark:text-red-300 border-red-200 dark:border-red-800/50",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}
    >
      {status}
    </span>
  );
}
