import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { User } from "@/types";
import DeletePlayerButton from "./DeletePlayerButton";

export const metadata: Metadata = { title: "Players" };

export default async function PlayersPage() {
  const players: User[] = await db
    .select()
    .from(users)
    .orderBy(asc(users.name));

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Players</h1>
        <Link
          href="/admin/players/new"
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + New Player
        </Link>
      </div>

      {players.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">No players yet.</p>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 overflow-hidden shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Avatar
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Status
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr
                  key={player.id}
                  className="border-b border-gray-200 dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-4 py-3">
                    {player.avatar_url ? (
                      <Image
                        src={blobImageSrc(player.avatar_url)}
                        alt={`${player.name} avatar`}
                        width={40}
                        height={40}
                        className="rounded-full object-cover"
                        unoptimized
                      />
                    ) : (
                      <div
                        className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-500 dark:text-gray-300 text-xs font-medium"
                        aria-label="No avatar"
                      >
                        {player.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">
                    {player.name}
                  </td>
                  <td className="px-4 py-3">
                    {player.is_active === 1 ? (
                      <span className="inline-flex items-center rounded-full border border-green-200 dark:border-green-800/50 bg-green-50 dark:bg-green-900/20 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-500 dark:text-gray-400">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/players/${player.id}/edit`}
                        className="rounded-lg border border-gray-200 dark:border-gray-600 px-3 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        Edit
                      </Link>
                      <DeletePlayerButton
                        playerId={player.id}
                        playerName={player.name}
                      />
                    </div>
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
