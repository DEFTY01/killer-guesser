import type { Metadata } from "next";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { games, game_players, roles, users, votes } from "@/db/schema";
import { and, asc, count, eq } from "drizzle-orm";
import { ArrowLeft, Skull, Trophy } from "@phosphor-icons/react/dist/ssr";

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
  death_reason: string | null;
  name: string;
  avatar_url: string | null;
  role_name: string | null;
  role_color: string | null;
  role_id: number | null;
}

// ── PlayerRow ─────────────────────────────────────────────────────

function PlayerRow({
  player,
  teamName,
  isCallerTeam,
  isKiller,
  accusedPlayerName,
}: {
  player: SummaryPlayer;
  teamName: string;
  isCallerTeam: boolean;
  isKiller: boolean;
  accusedPlayerName: string | null;
}) {
  const isDead = player.is_dead === 1 && player.revived_at === null;
  const isUndead = player.is_dead === 1 && player.revived_at !== null;
  // Seer (see_killer): red border for Killers, otherwise neutral
  const killerBorder = isKiller ? { borderColor: "#c0392b" } : undefined;

  return (
    <div
      className={`card flex items-center gap-3 p-3 ${
        isCallerTeam ? "ring-2 ring-accent" : ""
      }`}
      style={killerBorder}
    >
      {/* Avatar */}
      <div
        className={`relative size-12 shrink-0 overflow-hidden rounded-full bg-accent-soft ${isDead ? "grayscale opacity-70" : ""}`}
      >
        {player.avatar_url ? (
          <Image
            src={blobImageSrc(player.avatar_url)}
            alt={player.name}
            fill
            sizes="48px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-accent">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-fg">{player.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-muted">
          {/* Role color is data, shown as a swatch; text stays neutral for contrast */}
          <span
            className="size-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: player.role_color ?? undefined }}
            aria-hidden="true"
          />
          <span className="font-medium text-fg">{player.role_name ?? "Unknown"}</span>
          <span aria-hidden="true">/</span>
          <span>{teamName}</span>
        </p>
        {isDead && player.died_location && (
          <p className="mt-0.5 flex items-center gap-1 text-xs text-danger">
            <Skull className="size-3.5 shrink-0" aria-hidden="true" />
            {player.died_location}
            {player.died_time_of_day ? ` (${player.died_time_of_day})` : ""}
          </p>
        )}
        {isDead && accusedPlayerName && (
          <p className="mt-0.5 text-xs text-muted">
            Died because accused {accusedPlayerName}
          </p>
        )}
      </div>

      {/* Status badge */}
      <div className="shrink-0">
        {isDead ? (
          <span className="pill pill-danger">Dead</span>
        ) : isUndead ? (
          <span className="pill pill-accent">Undead</span>
        ) : (
          <span className="pill pill-success">Survived</span>
        )}
      </div>
    </div>
  );
}

// ── ErrorCard ─────────────────────────────────────────────────────

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8">
      <div className="card p-6">
        <h1 className="text-xl font-semibold text-fg">Summary unavailable</h1>
        <p className="mt-2 text-muted" role="alert">
          {message}
        </p>
        <Link href="/lobby" className="btn btn-primary mt-4">
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
    .select({
      id: game_players.id,
      team: game_players.team,
      permissions: roles.permissions,
    })
    .from(game_players)
    .leftJoin(roles, eq(game_players.role_id, roles.id))
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
      death_reason: game_players.death_reason,
      name: users.name,
      avatar_url: users.avatar_url,
      role_name: roles.name,
      role_color: roles.color_hex,
      role_id: game_players.role_id,
    })
    .from(game_players)
    .innerJoin(users, eq(game_players.user_id, users.id))
    .leftJoin(roles, eq(game_players.role_id, roles.id))
    .where(eq(game_players.game_id, id))
    .orderBy(users.name);

  // ── Determine if caller can see Killers (see_killer permission) ──
  const callerPermissions: string[] = (() => {
    try {
      return JSON.parse(callerRow.permissions ?? "[]") as string[];
    } catch {
      return [];
    }
  })();
  const canSeeKiller = callerPermissions.includes("see_killer");

  // ── Identify killer role ID ───────────────────────────────────
  const killerRoleRow = await db
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.name, "Killer"))
    .limit(1);
  const killerRoleId = killerRoleRow[0]?.id ?? null;

  // ── Build lookup: userId → player name (for accused death reason) ─
  const userNameById = new Map<number, string>();
  for (const p of players) {
    userNameById.set(p.user_id, p.name);
  }

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
    <div className="mx-auto w-full max-w-lg space-y-6 px-4 py-6">
      {/* ── Header ──────────────────────────────────────────── */}
      <div>
        <Link href="/lobby" className="btn btn-ghost -ml-3 mb-1">
          <ArrowLeft className="size-5" aria-hidden="true" />
          Back to lobby
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-fg">{game.name}</h1>
        <p className="mt-0.5 text-sm text-muted">
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
        <div className="card p-5 text-center">
          <Trophy className="mx-auto mb-2 size-10 text-accent" aria-hidden="true" />
          <p className="text-lg font-semibold text-fg">
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
                  ? "text-success"
                  : "text-danger"
              }`}
            >
              {callerTeam === game.winner_team ? "You won!" : "You lost."}
            </p>
          )}
        </div>
      ) : (
        <div className="card p-5 text-center">
          <p className="font-medium text-muted">Game ended without a winner</p>
        </div>
      )}

      {/* ── Players ──────────────────────────────────────── */}
      <section>
        <h2 className="mb-3 px-1 text-sm font-semibold text-muted">
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
            const isKiller = canSeeKiller && killerRoleId !== null && p.role_id === killerRoleId;
            // Parse accused user ID from death_reason like "accused:123"
            let accusedPlayerName: string | null = null;
            if (p.death_reason?.startsWith("accused:")) {
              const accusedId = Number(p.death_reason.slice("accused:".length));
              if (!isNaN(accusedId)) {
                accusedPlayerName = userNameById.get(accusedId) ?? null;
              }
            }
            return (
              <PlayerRow
                key={p.id}
                player={p}
                teamName={teamName}
                isCallerTeam={callerTeam != null && p.team === callerTeam}
                isKiller={isKiller}
                accusedPlayerName={accusedPlayerName}
              />
            );
          })}
        </div>
      </section>

      {/* ── Vote history ─────────────────────────────────── */}
      {dayNumbers.length > 0 && (
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold text-muted">
            Vote History
          </h2>
          <div className="space-y-4">
            {dayNumbers.map((day) => (
              <div key={day}>
                <p className="mb-2 px-1 text-sm font-semibold text-fg">
                  Day {day}
                </p>
                <div className="space-y-1.5">
                  {votesByDay[day]
                    .sort((a, b) => b.vote_count - a.vote_count)
                    .map((v) => (
                      <div
                        key={v.target_id}
                        className="flex items-center gap-2 rounded-control border border-line bg-surface px-3 py-2"
                      >
                        <div className="relative size-7 shrink-0 overflow-hidden rounded-full bg-accent-soft">
                          {v.target_avatar ? (
                            <Image
                              src={blobImageSrc(v.target_avatar)}
                              alt={v.target_name}
                              fill
                              sizes="28px"
                              className="object-cover"
                              unoptimized
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-accent">
                              {v.target_name.charAt(0).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span className="flex-1 text-sm text-fg">
                          {v.target_name}
                        </span>
                        <span className="text-sm font-semibold text-fg">
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

