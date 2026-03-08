import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/db";
import { games, game_settings, game_players, users } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { GameStatus } from "@/types";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound, redirect } from "next/navigation";
import Image from "next/image";

export const metadata: Metadata = { title: "Game Detail" };

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

export default async function GameDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const { id } = await params;

  const [game] = await db.select().from(games).where(eq(games.id, id));
  if (!game) notFound();

  const [[settings], players] = await Promise.all([
    db
      .select()
      .from(game_settings)
      .where(eq(game_settings.game_id, id)),
    db
      .select({
        id: game_players.id,
        user_id: game_players.user_id,
        team: game_players.team,
        is_dead: game_players.is_dead,
        name: users.name,
        avatar_url: users.avatar_url,
      })
      .from(game_players)
      .innerJoin(users, eq(game_players.user_id, users.id))
      .where(eq(game_players.game_id, id)),
  ]);

  const team1Players = players.filter((p) => p.team === "team1");
  const team2Players = players.filter((p) => p.team === "team2");
  const unassignedPlayers = players.filter((p) => !p.team);

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link
          href="/admin/games"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Games
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
        <StatusBadge status={game.status} />
      </div>

      {/* Game info grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 mb-6">
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Game Info
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">ID</dt>
              <dd className="font-mono font-medium">{game.id}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Start</dt>
              <dd>{new Date(game.start_time * 1000).toLocaleString()}</dd>
            </div>
            {game.vote_window_start && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Vote window</dt>
                <dd>
                  {game.vote_window_start} – {game.vote_window_end}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-gray-500">Created</dt>
              <dd>{new Date(game.created_at * 1000).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>

        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Teams
          </p>
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-gray-500">{game.team1_name}</dt>
              <dd>{team1Players.length} players</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">{game.team2_name}</dt>
              <dd>{team2Players.length} players</dd>
            </div>
            {unassignedPlayers.length > 0 && (
              <div className="flex justify-between">
                <dt className="text-gray-500">Unassigned</dt>
                <dd>{unassignedPlayers.length} players</dd>
              </div>
            )}
          </dl>
        </div>
      </div>

      {/* Game settings */}
      {settings && (
        <div className="rounded-xl border bg-white p-5 shadow-sm mb-6">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Settings
          </p>
          <div className="flex flex-wrap gap-6 text-sm">
            {settings.special_role_count != null ? (
              <div>
                <span className="text-gray-500">Special roles: </span>
                <span className="font-medium">{settings.special_role_count}</span>
              </div>
            ) : (
              <div>
                <span className="text-gray-500">Roles: </span>
                <span className="font-medium">Fully random</span>
              </div>
            )}
            {settings.murder_item_name && (
              <div>
                <span className="text-gray-500">Murder item: </span>
                <span className="font-medium">{settings.murder_item_name}</span>
              </div>
            )}
            {settings.murder_item_url && (
              <div className="relative w-16 h-16">
                <Image
                  src={settings.murder_item_url}
                  alt={settings.murder_item_name ?? "Murder item"}
                  fill
                  className="object-contain rounded"
                  sizes="64px"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Players */}
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b bg-gray-50">
          <h2 className="text-sm font-semibold text-gray-700">
            Players ({players.length})
          </h2>
        </div>
        {players.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No players.</p>
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Player
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Team
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
                        {p.avatar_url ? (
                          <Image
                            src={p.avatar_url}
                            alt={p.name}
                            fill
                            className="object-cover"
                            sizes="32px"
                          />
                        ) : (
                          <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500">
                            {p.name[0]?.toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="font-medium">{p.name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {p.team === "team1"
                      ? game.team1_name
                      : p.team === "team2"
                        ? game.team2_name
                        : "—"}
                  </td>
                  <td className="px-4 py-3">
                    {p.is_dead ? (
                      <span className="text-red-500 font-medium">Dead</span>
                    ) : (
                      <span className="text-green-600 font-medium">Alive</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
