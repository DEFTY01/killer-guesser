import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, game_players } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import type { GameStatus } from "@/types";
import { requireAdmin } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Games" };

// ── Constants ─────────────────────────────────────────────────────

const TABS: { key: GameStatus; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "scheduled", label: "Scheduled" },
  { key: "closed", label: "Closed" },
  { key: "deleted", label: "Deleted" },
];

// ── Helpers ───────────────────────────────────────────────────────

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

/** Returns the destination URL for a game row based on its status. */
function gameHref(id: string, status: GameStatus): string {
  if (status === "closed") return `/admin/games/${id}/history`;
  return `/admin/games/${id}`;
}

// ── Page ──────────────────────────────────────────────────────────

export default async function GamesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const { tab } = await searchParams;
  const activeTab: GameStatus =
    TABS.find((t) => t.key === tab)?.key ?? "active";

  const allGames = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      winner_team: games.winner_team,
      created_at: games.created_at,
      player_count: sql<number>`count(${game_players.id})`.as("player_count"),
    })
    .from(games)
    .leftJoin(game_players, eq(games.id, game_players.game_id))
    .groupBy(games.id)
    .orderBy(desc(games.created_at));

  const tabGames = allGames.filter((g) => g.status === activeTab);

  // Per-tab counts for the tab badges.
  const counts = Object.fromEntries(
    TABS.map((t) => [t.key, allGames.filter((g) => g.status === t.key).length]),
  ) as Record<GameStatus, number>;

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Games</h1>
        <Link
          href="/admin/games/new"
          className="inline-flex items-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
        >
          + New Game
        </Link>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {TABS.map(({ key, label }) => {
          const isActive = key === activeTab;
          return (
            <Link
              key={key}
              href={`/admin/games?tab=${key}`}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                isActive
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
              }`}
            >
              {label}
              {counts[key] > 0 && (
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    isActive
                      ? "bg-indigo-100 text-indigo-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {counts[key]}
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {/* Table */}
      {tabGames.length === 0 ? (
        <p className="text-sm text-gray-500">No {activeTab} games.</p>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
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
                  Start Date
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Winning Team
                </th>
              </tr>
            </thead>
            <tbody>
              {tabGames.map((game) => {
                const href = gameHref(game.id, game.status as GameStatus);
                const winnerLabel =
                  game.winner_team === "team1"
                    ? game.team1_name
                    : game.winner_team === "team2"
                      ? game.team2_name
                      : "—";
                return (
                  <tr
                    key={game.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    <td className="px-4 py-3 font-medium">
                      <Link
                        href={href}
                        className="text-indigo-600 hover:text-indigo-800 hover:underline"
                      >
                        {game.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={game.status as GameStatus} />
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {game.player_count}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(game.start_time * 1000).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-gray-500">{winnerLabel}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
