import type { Metadata } from "next";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import Link from "next/link";
import { db } from "@/db";
import { games, game_players, users, roles, events, votes } from "@/db/schema";
import { and, asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { notFound, redirect } from "next/navigation";
import type { GameStatus } from "@/types";

export const metadata: Metadata = { title: "Game History" };

// ── Types ─────────────────────────────────────────────────────────

interface PlayerRow {
  id: number;
  user_id: number;
  team: "team1" | "team2" | null;
  is_dead: number;
  died_at: number | null;
  died_location: string | null;
  died_time_of_day: string | null;
  revived_at: number | null;
  name: string;
  avatar_url: string | null;
  role_name: string | null;
  role_color: string | null;
}

interface EventRow {
  id: number;
  day: number;
  type: string;
  payload: string | null;
  created_at: number;
}

interface VoteTally {
  target_id: number;
  target_name: string;
  target_avatar: string | null;
  vote_count: number;
}

// ── Helpers ───────────────────────────────────────────────────────

/** Format a unix timestamp as a readable date+time string. */
function fmtDatetime(ts: number): string {
  return new Date(ts * 1000).toLocaleString();
}

/** Format a unix timestamp as a date-only string. */
function fmtDate(ts: number): string {
  return new Date(ts * 1000).toLocaleDateString();
}

/** Compute a human-readable game duration from start_time and a reference end. */
function formatDuration(startTs: number, endTs: number): string {
  const diffMs = (endTs - startTs) * 1000;
  if (diffMs <= 0) return "—";
  const totalSecs = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSecs / 86400);
  const hours = Math.floor((totalSecs % 86400) / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (mins > 0) parts.push(`${mins}m`);
  return parts.length > 0 ? parts.join(" ") : "< 1m";
}

function EventTypeBadge({ type }: { type: string }) {
  const label = type.replace(/_/g, " ");
  const color =
    type.includes("died") || type.includes("kill") || type.includes("dead")
      ? "bg-red-50 text-red-700 border-red-200"
      : type.includes("vote") || type.includes("elect")
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : type.includes("revive")
          ? "bg-green-50 text-green-700 border-green-200"
          : "bg-gray-50 text-gray-600 border-gray-200";
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${color}`}
    >
      {label}
    </span>
  );
}

// ── Page ──────────────────────────────────────────────────────────

export default async function GameHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const { id } = await params;

  // Fetch game metadata.
  const [game] = await db
    .select()
    .from(games)
    .where(eq(games.id, id))
    .limit(1);

  if (!game) notFound();

  // Fetch all data in parallel.
  const [players, allEvents, voteRows] = await Promise.all([
    db
      .select({
        id: game_players.id,
        user_id: game_players.user_id,
        team: game_players.team,
        is_dead: game_players.is_dead,
        died_at: game_players.died_at,
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
      .where(eq(game_players.game_id, id)),

    db
      .select({
        id: events.id,
        day: events.day,
        type: events.type,
        payload: events.payload,
        created_at: events.created_at,
      })
      .from(events)
      .where(and(eq(events.game_id, id), eq(events.is_archived, 1)))
      .orderBy(asc(events.created_at)),

    db
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
      .orderBy(asc(votes.day)),
  ]);

  // Group events by day.
  const eventsByDay = new Map<number, EventRow[]>();
  for (const ev of allEvents) {
    if (!eventsByDay.has(ev.day)) eventsByDay.set(ev.day, []);
    eventsByDay.get(ev.day)!.push(ev);
  }

  // Group vote tallies by day.
  const votesByDay = new Map<number, VoteTally[]>();
  for (const row of voteRows) {
    if (!votesByDay.has(row.day)) votesByDay.set(row.day, []);
    votesByDay.get(row.day)!.push({
      target_id: row.target_id,
      target_name: row.target_name,
      target_avatar: row.target_avatar,
      vote_count: row.vote_count,
    });
  }

  // All days present in events or votes.
  const allDays = Array.from(
    new Set([...eventsByDay.keys(), ...votesByDay.keys()]),
  ).sort((a, b) => a - b);

  // Compute duration (use last event timestamp or now as reference).
  const lastEventTs =
    allEvents.length > 0
      ? allEvents[allEvents.length - 1].created_at
      : game.start_time;
  const durationLabel = formatDuration(game.start_time, lastEventTs);

  // Winning team display name.
  const winnerLabel =
    game.winner_team === "team1"
      ? game.team1_name
      : game.winner_team === "team2"
        ? game.team2_name
        : null;

  // Sort players: alive first, then dead by death time.
  const sortedPlayers = [...players].sort((a, b) => {
    if (a.is_dead !== b.is_dead) return a.is_dead - b.is_dead;
    return (a.died_at ?? 0) - (b.died_at ?? 0);
  });

  return (
    <div className="max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 mb-6">
        <Link
          href="/admin/games?tab=closed"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Games
        </Link>
        <span className="text-gray-300" aria-hidden="true">
          /
        </span>
        <span className="text-sm font-mono text-gray-500">{id}</span>
        <span className="text-gray-300" aria-hidden="true">
          /
        </span>
        <span className="text-sm text-gray-500">History</span>
      </div>

      {/* Header card */}
      <div className="rounded-xl border bg-white shadow-sm p-6 mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{game.name}</h1>
            <p className="mt-1 text-sm text-gray-500">
              Started {fmtDate(game.start_time)} · Duration {durationLabel}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                (game.status as GameStatus) === "closed"
                  ? "bg-gray-50 text-gray-600 border-gray-200"
                  : "bg-red-50 text-red-400 border-red-200"
              }`}
            >
              {game.status}
            </span>
            {winnerLabel ? (
              <span className="inline-flex items-center rounded-full border bg-emerald-50 text-emerald-700 border-emerald-200 px-3 py-1 text-sm font-semibold">
                🏆 {winnerLabel} won
              </span>
            ) : (
              <span className="text-sm text-gray-400 italic">
                No winner recorded
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Timeline ── */}
      {allDays.length > 0 && (
        <section aria-labelledby="timeline-heading" className="mb-10">
          <h2
            id="timeline-heading"
            className="text-lg font-semibold text-gray-900 mb-4"
          >
            Timeline
          </h2>
          <ol className="relative border-l border-gray-200 space-y-8 pl-6">
            {allDays.map((day) => {
              const dayEvents = eventsByDay.get(day) ?? [];
              const dayVotes = votesByDay.get(day) ?? [];
              const totalVotes = dayVotes.reduce(
                (s, v) => s + v.vote_count,
                0,
              );
              const topVote =
                dayVotes.length > 0
                  ? dayVotes.reduce((a, b) =>
                      a.vote_count >= b.vote_count ? a : b,
                    )
                  : null;

              return (
                <li key={day} className="relative">
                  {/* Day marker */}
                  <span className="absolute -left-9 flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 border border-indigo-300 text-xs font-bold text-indigo-700">
                    {day}
                  </span>
                  <div className="rounded-xl border bg-white shadow-sm p-4">
                    <h3 className="font-semibold text-gray-800 mb-3 text-sm uppercase tracking-wide">
                      Day {day}
                    </h3>

                    {/* Events */}
                    {dayEvents.length > 0 && (
                      <div className="mb-3">
                        <p className="text-xs font-medium text-gray-500 mb-2">
                          Events
                        </p>
                        <ul className="space-y-1">
                          {dayEvents.map((ev) => (
                            <li
                              key={ev.id}
                              className="flex items-start gap-2 text-sm text-gray-700"
                            >
                              <EventTypeBadge type={ev.type} />
                              {ev.payload && (
                                <span className="text-gray-500 text-xs mt-0.5 break-all">
                                  {ev.payload}
                                </span>
                              )}
                              <span className="ml-auto text-xs text-gray-400 shrink-0">
                                {fmtDatetime(ev.created_at)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Voting summary */}
                    {dayVotes.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-2">
                          Vote Results ({totalVotes} vote
                          {totalVotes !== 1 ? "s" : ""})
                        </p>
                        <ul className="space-y-1.5">
                          {dayVotes
                            .sort((a, b) => b.vote_count - a.vote_count)
                            .map((v) => (
                              <li
                                key={v.target_id}
                                className="flex items-center gap-2"
                              >
                                {v.target_avatar && (
                                  <Image
                                    src={blobImageSrc(v.target_avatar)}
                                    alt={v.target_name}
                                    width={24}
                                    height={24}
                                    className="rounded-full object-cover shrink-0"
                                    unoptimized
                                  />
                                )}
                                <span className="text-sm text-gray-700 min-w-0 truncate">
                                  {v.target_name}
                                </span>
                                {/* Vote bar */}
                                <div className="flex-1 mx-2 h-2 rounded-full bg-gray-100 overflow-hidden min-w-0">
                                  <div
                                    className={`h-full rounded-full ${
                                      topVote?.target_id === v.target_id
                                        ? "bg-red-400"
                                        : "bg-blue-300"
                                    }`}
                                    style={{
                                      width: `${totalVotes > 0 ? (v.vote_count / totalVotes) * 100 : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-xs font-semibold text-gray-600 shrink-0">
                                  {v.vote_count}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    )}

                    {dayEvents.length === 0 && dayVotes.length === 0 && (
                      <p className="text-sm text-gray-400 italic">
                        No activity recorded.
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      {/* ── Players table ── */}
      <section aria-labelledby="players-heading" className="mb-10">
        <h2
          id="players-heading"
          className="text-lg font-semibold text-gray-900 mb-4"
        >
          Players ({sortedPlayers.length})
        </h2>
        {sortedPlayers.length === 0 ? (
          <p className="text-sm text-gray-500">No players.</p>
        ) : (
          <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Team
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Fate
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Death Location
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">
                    Time of Day
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPlayers.map((p: PlayerRow) => (
                  <tr
                    key={p.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    {/* Avatar + Name */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {p.avatar_url ? (
                          <Image
                            src={blobImageSrc(p.avatar_url)}
                            alt={p.name}
                            width={32}
                            height={32}
                            className={`rounded-full object-cover shrink-0 ${p.is_dead ? "grayscale opacity-60" : ""}`}
                            unoptimized
                          />
                        ) : (
                          <div
                            className={`w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0 ${p.is_dead ? "opacity-60" : ""}`}
                          >
                            {p.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span
                          className={`font-medium ${p.is_dead ? "text-gray-400 line-through" : "text-gray-900"}`}
                        >
                          {p.name}
                        </span>
                      </div>
                    </td>
                    {/* Team */}
                    <td className="px-4 py-3 text-gray-500">
                      {p.team ? (
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${
                            p.team === "team1"
                              ? "bg-blue-50 text-blue-700 border-blue-200"
                              : "bg-purple-50 text-purple-700 border-purple-200"
                          }`}
                        >
                          {p.team === "team1"
                            ? game.team1_name
                            : game.team2_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* Role */}
                    <td className="px-4 py-3">
                      {p.role_name ? (
                        <span
                          className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
                          style={
                            p.role_color
                              ? {
                                  borderColor: `${p.role_color}40`,
                                  backgroundColor: `${p.role_color}15`,
                                  color: p.role_color,
                                }
                              : {}
                          }
                        >
                          {p.role_name}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    {/* Fate */}
                    <td className="px-4 py-3">
                      {p.is_dead ? (
                        <span className="inline-flex items-center rounded-full border bg-red-50 text-red-700 border-red-200 px-2 py-0.5 text-xs font-medium">
                          ☠️ Dead
                          {p.died_at
                            ? ` · ${fmtDate(p.died_at)}`
                            : ""}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full border bg-green-50 text-green-700 border-green-200 px-2 py-0.5 text-xs font-medium">
                          Alive
                        </span>
                      )}
                    </td>
                    {/* Death Location */}
                    <td className="px-4 py-3 text-gray-500">
                      {p.died_location ?? "—"}
                    </td>
                    {/* Time of Day */}
                    <td className="px-4 py-3 text-gray-500 capitalize">
                      {p.died_time_of_day ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Voting History ── */}
      {votesByDay.size > 0 && (
        <section aria-labelledby="votes-heading" className="mb-10">
          <h2
            id="votes-heading"
            className="text-lg font-semibold text-gray-900 mb-4"
          >
            Voting History
          </h2>
          <div className="space-y-6">
            {Array.from(votesByDay.entries())
              .sort(([a], [b]) => a - b)
              .map(([day, tallies]) => {
                const total = tallies.reduce(
                  (s, v) => s + v.vote_count,
                  0,
                );
                return (
                  <div
                    key={day}
                    className="rounded-xl border bg-white shadow-sm p-4"
                  >
                    <h3 className="font-semibold text-gray-800 mb-3 text-sm">
                      Day {day} —{" "}
                      <span className="font-normal text-gray-500">
                        {total} vote{total !== 1 ? "s" : ""}
                      </span>
                    </h3>
                    <ul className="space-y-2">
                      {tallies
                        .sort((a, b) => b.vote_count - a.vote_count)
                        .map((v) => (
                          <li
                            key={v.target_id}
                            className="flex items-center gap-3"
                          >
                            {v.target_avatar && (
                              <Image
                                src={blobImageSrc(v.target_avatar)}
                                alt={v.target_name}
                                width={28}
                                height={28}
                                className="rounded-full object-cover shrink-0"
                                unoptimized
                              />
                            )}
                            <span className="text-sm text-gray-700 w-32 truncate shrink-0">
                              {v.target_name}
                            </span>
                            <div className="flex-1 h-3 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-400 transition-all"
                                style={{
                                  width: `${total > 0 ? (v.vote_count / total) * 100 : 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-sm font-bold text-gray-700 w-8 text-right shrink-0">
                              {v.vote_count}
                            </span>
                          </li>
                        ))}
                    </ul>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {allDays.length === 0 && players.length === 0 && (
        <p className="text-sm text-gray-500 italic">
          No history data recorded for this game.
        </p>
      )}
    </div>
  );
}
