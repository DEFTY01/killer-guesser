"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCountdown } from "@/hooks/useCountdown";

// ── Types ─────────────────────────────────────────────────────────

interface LobbyGame {
  id: string;
  name: string;
  status: string;
  start_time: number;
  team1_name: string;
  team2_name: string;
  winner_team: string | null;
  player_count: number;
  user_team?: string | null;
}

interface LobbyData {
  active: LobbyGame[];
  scheduled: LobbyGame[];
  past: LobbyGame[];
}

// ── Helper to set the selectedGameId cookie ───────────────────────

function setSelectedGameCookie(gameId: string) {
  document.cookie = `selectedGameId=${gameId}; path=/; SameSite=Lax`;
}

// ── Skeleton card ─────────────────────────────────────────────────

function SkeletonCard({ tall = false }: { tall?: boolean }) {
  return (
    <div
      className={`animate-pulse rounded-2xl bg-white/60 border border-white/40 ${tall ? "h-32" : "h-20"}`}
    />
  );
}

// ── Active game card ──────────────────────────────────────────────

function ActiveCard({ game }: { game: LobbyGame }) {
  return (
    <Link
      href={`/game/${game.id}`}
      prefetch
      onClick={() => setSelectedGameCookie(game.id)}
      className="w-full text-left rounded-2xl bg-white border border-gray-100 shadow-md p-5 flex items-center justify-between gap-4 hover:shadow-lg active:scale-[0.98] transition-all"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-semibold text-green-700 uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
            LIVE
          </span>
        </div>
        <p className="font-semibold text-gray-900 truncate text-lg">
          {game.name}
        </p>
        <p className="text-sm text-gray-500">
          {game.player_count} player{game.player_count !== 1 ? "s" : ""}
        </p>
      </div>
      <span className="shrink-0 text-indigo-600 font-bold text-lg">
        Join →
      </span>
    </Link>
  );
}

// ── Countdown display ─────────────────────────────────────────────

function CountdownDisplay({ startTime }: { startTime: number }) {
  const target = new Date(startTime * 1000);
  const { hours, minutes, seconds, isExpired } = useCountdown(target);

  if (isExpired) {
    return (
      <span className="text-sm text-amber-600 font-medium">
        Starting soon…
      </span>
    );
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="text-sm font-mono text-indigo-600 font-semibold tabular-nums">
      {hours > 0 ? `${pad(hours)}h ` : ""}
      {pad(minutes)}m {pad(seconds)}s
    </span>
  );
}

// ── Scheduled game card ───────────────────────────────────────────

function ScheduledCard({ game }: { game: LobbyGame }) {
  const router = useRouter();
  const [now] = useState(() => Date.now());
  const isPast = game.start_time * 1000 < now;

  function handleTap() {
    router.push(`/game/${game.id}/lobby`);
  }

  const startDate = new Date(game.start_time * 1000);
  const formattedDate = startDate.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <button
      onClick={handleTap}
      className="w-full text-left rounded-2xl bg-white border border-gray-100 shadow-sm p-4 flex items-center justify-between gap-4 hover:shadow-md active:scale-[0.98] transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-gray-900 truncate">{game.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{formattedDate}</p>
      </div>
      <div className="shrink-0 text-right">
        {isPast ? (
          <span className="text-sm text-amber-600 font-medium">
            Starting soon…
          </span>
        ) : (
          <CountdownDisplay startTime={game.start_time} />
        )}
      </div>
    </button>
  );
}

// ── Past game card ────────────────────────────────────────────────

function PastCard({ game }: { game: LobbyGame }) {
  const router = useRouter();

  // winner_team is now stored as the team identifier ("team1" | "team2").
  // Compare directly with the player's own team assignment.
  const userWon =
    game.user_team != null &&
    game.winner_team != null &&
    game.user_team === game.winner_team;

  const resultLabel =
    game.winner_team == null
      ? null
    : game.user_team == null
      ? null
      : userWon
        ? "Won"
        : "Lost";

  const endDate = new Date(game.start_time * 1000).toLocaleDateString(
    undefined,
    { month: "short", day: "numeric", year: "numeric" },
  );

  return (
    <button
      onClick={() => router.push(`/game/${game.id}/summary`)}
      className="w-full text-left rounded-xl bg-white/50 border border-gray-100 p-3 flex items-center justify-between gap-3 hover:bg-white/70 active:scale-[0.99] transition-all"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-gray-700 truncate text-sm">
          {game.name}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">{endDate}</p>
      </div>
      {resultLabel && (
        <span
          className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full ${
            resultLabel === "Won"
              ? "bg-green-100 text-green-700"
              : "bg-red-100 text-red-600"
          }`}
        >
          {resultLabel}
        </span>
      )}
    </button>
  );
}

// ── Section wrapper (fades in when visible) ───────────────────────

function Section({
  title,
  children,
  visible,
}: {
  title: string;
  children: React.ReactNode;
  visible: boolean;
}) {
  return (
    <div
      className={`transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      aria-hidden={!visible}
    >
      <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
        {title}
      </h2>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-24 text-center">
      {/* Mountain icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        className="w-16 h-16 text-indigo-200"
        fill="currentColor"
        aria-hidden="true"
      >
        <path d="M2 54 L22 18 L32 30 L42 14 L62 54 Z" />
      </svg>
      <p className="text-base font-medium text-gray-400 max-w-xs">
        No games yet — your host will set one up!
      </p>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <div className="h-3 w-24 rounded-full bg-gray-200 animate-pulse" />
        <SkeletonCard tall />
        <SkeletonCard tall />
      </div>
      <div className="flex flex-col gap-3">
        <div className="h-3 w-28 rounded-full bg-gray-200 animate-pulse" />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    </div>
  );
}

// ── Main lobby page ───────────────────────────────────────────────

export default function LobbyPage() {
  const [data, setData] = useState<LobbyData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchLobby = useCallback(async () => {
    try {
      const res = await fetch("/api/game/lobby");
      if (!res.ok) throw new Error("Failed to load lobby");
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchLobby();
  }, [fetchLobby]);

  const isLoading = data === null && error === null;
  const isEmpty =
    data !== null &&
    data.active.length === 0 &&
    data.scheduled.length === 0 &&
    data.past.length === 0;

  const hasActive = (data?.active.length ?? 0) > 0;
  const hasScheduled = (data?.scheduled.length ?? 0) > 0;
  const hasPast = (data?.past.length ?? 0) > 0;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Your Games</h1>

      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {isLoading && <LoadingSkeleton />}

      {!isLoading && isEmpty && <EmptyState />}

      {!isLoading && !isEmpty && (
        <div className="flex flex-col gap-8">
          {/* ── Section 1: Active games ──────────────────────── */}
          {hasActive ? (
            <Section title="Active" visible>
              {data!.active.map((g) => (
                <ActiveCard key={g.id} game={g} />
              ))}
            </Section>
          ) : (
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3 px-1">
                Active
              </h2>
              <p className="text-sm text-gray-400 px-1">No active game</p>
            </div>
          )}

          {/* ── Section 2: Upcoming games ────────────────────── */}
          <Section title="Upcoming" visible={hasScheduled}>
            {data!.scheduled.map((g) => (
              <ScheduledCard key={g.id} game={g} />
            ))}
          </Section>

          {/* ── Section 3: Past games ────────────────────────── */}
          <Section title="Past Games" visible={hasPast}>
            {data!.past.map((g) => (
              <PastCard key={g.id} game={g} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
