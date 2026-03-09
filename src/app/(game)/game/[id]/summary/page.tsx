import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players, roles, users, votes } from "@/db/schema";
import { and, asc, count, eq } from "drizzle-orm";

export const metadata: Metadata = { title: "Game Summary" };

// ── Types ─────────────────────────────────────────────────────────

interface SummaryPlayer {
  id: number;
  user_id: number;
  team: "team1" | "team2" | null;
  is_dead: number;
  died_location: string | null;
  died_time_of_day: string | null;
  revived_at: number | null;
  name: string;
  avatar_url: string | null;
  role_name: string | null;
  role_color: string | null;
}

// ── PlayerRow ─────────────────────────────────────────────────────

function PlayerRow({
  player,
  teamName,
  isCallerTeam,
}: {
  player: SummaryPlayer;
  teamName: string;
  isCallerTeam: boolean;
}) {
  const isDead = player.is_dead === 1 && player.revived_at === null;
  const isUndead = player.is_dead === 1 && player.revived_at !== null;
  const borderColor = player.role_color ?? "#2E6DA4";

  return (
    <div
      className={`flex items-center gap-3 rounded-xl p-3 border bg-white ${
        isCallerTeam ? "ring-2 ring-indigo-400 ring-offset-1" : ""
      }`}
      style={{ borderColor }}
    >
      {/* Avatar */}
      <div
        className={`relative w-12 h-12 rounded-full overflow-hidden bg-gray-100 shrink-0 ${isDead ? "grayscale opacity-70" : ""}`}
      >
        {player.avatar_url ? (
          <Image
            src={player.avatar_url}
            alt={player.name}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-500">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{player.name}</p>
        <p className="text-xs text-gray-500">
          <span
            className="font-medium"
            style={{ color: player.role_color ?? undefined }}
          >
            {player.role_name ?? "Unknown"}
          </span>
          {" · "}
          <span className="text-gray-400">{teamName}</span>
        </p>
        {isDead && player.died_location && (
          <p className="text-xs text-red-500 mt-0.5">
            ✝ {player.died_location}
            {player.died_time_of_day ? ` (${player.died_time_of_day})` : ""}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        {isDead ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
            Dead
          </span>
        ) : isUndead ? (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-600">
            Undead
          </span>
        ) : (
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
            Survived
          </span>
        )}
      </div>
    </div>
  );
}

// ── ErrorCard ─────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
        <h1 className="text-xl font-bold text-red-900">Summary unavailable</h1>
        <p className="mt-2 text-red-700">{message}</p>
        <Link
          href="/lobby"
          className="mt-4 inline-flex items-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
        >
          Back to lobby
        </Link>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default async function GameSummaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();

  if (!session || session.user?.role !== "player") {
    redirect("/login");
  }

  const userId = Number(session.user.id);
  if (!userId || isNaN(userId)) {
    return <ErrorCard message="Your session is invalid. Please sign in again." />;
  }

  // ── Load game ─────────────────────────────────────────────────
  const [game] = await db
    .select({
      id: games.id,
      name: games.name,
      status: games.status,
      start_time: games.start_time,
      team1_name: games.team1_name,
      team2_name: games.team2_name,
      winner_team: games.winner_team,
    })
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) {
    return <ErrorCard message="This game does not exist." />;
  }

  if (game.status !== "closed") {
    return <ErrorCard message="This game has not ended yet." />;
  }

  // ── Verify caller is a participant ────────────────────────────
  const [callerRow] = await db
    .select({ id: game_players.id, team: game_players.team })
    .from(game_players)
    .where(
      and(eq(game_players.game_id, id), eq(game_players.user_id, userId)),
    )
    .limit(1);

  if (!callerRow) {
    return (
      <ErrorCard message="You were not a participant in this game." />
    );
  }

  // ── Load all players ──────────────────────────────────────────
  const players = await db
    .select({
      id: game_players.id,
      user_id: game_players.user_id,
      team: game_players.team,
      is_dead: game_players.is_dead,
      died_location: game_players.died_location,
      died_time_of_day: game_players.died_time_of_day,
      revived_at: game_players.revived_at,
      name: users.name,
      avatar_url: users.avatar_url,
      role_name: roles.name,
      role_color: roles.color_hex,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(eq(game_players.game_id, id))
    .orderBy(users.name);

  // ── Vote tallies per day ──────────────────────────────────────
  const voteRows = await db
    .select({
      day: votes.day,
      target_id: votes.target_id,
      target_name: users.name,
      target_avatar: users.avatar_url,
      vote_count: count(votes.id),
    })
    .from(votes)
    .innerJoin(users, eq(votes.target_id, users.id))
    .where(eq(votes.game_id, id))
    .groupBy(votes.day, votes.target_id, users.name, users.avatar_url)
    .orderBy(asc(votes.day));

  const votesByDay: Record<
    number,
    Array<{
      target_id: number;
      target_name: string;
      target_avatar: string | null;
      vote_count: number;
    }>
  > = {};
  for (const row of voteRows) {
    if (!votesByDay[row.day]) votesByDay[row.day] = [];
    votesByDay[row.day].push({
      target_id: row.target_id,
      target_name: row.target_name,
      target_avatar: row.target_avatar,
      vote_count: row.vote_count,
    });
  }

  const callerTeam = callerRow.team;
  const dayNumbers = Object.keys(votesByDay)
    .map(Number)
    .sort((a, b) => a - b);

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <Link
          href="/lobby"
          className="text-sm text-indigo-600 hover:text-indigo-700 font-medium mb-3 inline-flex items-center gap-1"
        >
          ← Back to lobby
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-1">{game.name}</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          {new Date(game.start_time * 1000).toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* ── Winner banner ────────────────────────────────── */}
      {game.winner_team ? (
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 text-center">
          <div className="text-4xl mb-2">🏆</div>
          <p className="text-lg font-bold text-amber-900">
            {game.winner_team === "team1"
              ? game.team1_name
              : game.winner_team === "team2"
                ? game.team2_name
                : game.winner_team}{" "}
            wins!
          </p>
          {callerTeam != null && (
            <p
              className={`mt-1 text-sm font-semibold ${
                callerTeam === game.winner_team
                  ? "text-green-700"
                  : "text-red-600"
              }`}
            >
              {callerTeam === game.winner_team
                ? "You won! 🎉"
                : "You lost. 😞"}
            </p>
          )}
        </div>
      ) : (
        <div className="rounded-2xl bg-gray-50 border border-gray-200 p-5 text-center">
          <p className="text-gray-500 font-medium">Game ended without a winner</p>
        </div>
      )}

      {/* ── Players ──────────────────────────────────────── */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
          Players
        </h2>
        <div className="space-y-2">
          {players.map((p) => {
            const teamName =
              p.team === "team1"
                ? game.team1_name
                : p.team === "team2"
                  ? game.team2_name
                  : "Unknown";
            return (
              <PlayerRow
                key={p.id}
                player={p}
                teamName={teamName}
                isCallerTeam={callerTeam != null && p.team === callerTeam}
              />
            );
          })}
        </div>
      </section>

      {/* ── Vote history ─────────────────────────────────── */}
      {dayNumbers.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">
            Vote History
          </h2>
          <div className="space-y-4">
            {dayNumbers.map((day) => (
              <div key={day}>
                <p className="text-sm font-semibold text-gray-600 mb-2">
                  Day {day}
                </p>
                <div className="space-y-1">
                  {votesByDay[day]
                    .sort((a, b) => b.vote_count - a.vote_count)
                    .map((v) => (
                      <div
                        key={v.target_id}
                        className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2"
                      >
                        <div className="relative w-7 h-7 rounded-full overflow-hidden bg-gray-100 shrink-0">
                          {v.target_avatar ? (
                            <Image
                              src={v.target_avatar}
                              alt={v.target_name}
                              fill
                              sizes="28px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-bold text-gray-500">
                              {v.target_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="flex-1 text-sm text-gray-700">
                          {v.target_name}
                        </span>
                        <span className="text-sm font-bold text-gray-900">
                          {v.vote_count} vote{v.vote_count !== 1 ? "s" : ""}
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

