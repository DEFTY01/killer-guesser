"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Mountains } from "@phosphor-icons/react";
import { useCountdown } from "@/hooks/useCountdown";
import { Skeleton, SkeletonRow } from "@/components/ui/Skeleton";

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

// ── Active game card ──────────────────────────────────────────────

function ActiveCard({ game }: { game: LobbyGame }) {
  return (
    <Link
      href={`/game/${game.id}`}
      prefetch
      onClick={() => setSelectedGameCookie(game.id)}
      className="card flex items-center justify-between gap-4 p-5 transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1 space-y-1.5">
        {/* The one semantic live indicator */}
        <span className="pill pill-success">
          <span
            className="size-1.5 animate-pulse rounded-full bg-success"
            aria-hidden="true"
          />
          LIVE
        </span>
        <p className="truncate text-lg font-semibold text-fg">{game.name}</p>
        <p className="text-sm text-muted">
          {game.player_count} player{game.player_count !== 1 ? "s" : ""}
        </p>
      </div>
      <span className="btn btn-primary shrink-0">
        Join
        <ArrowRight className="size-5" aria-hidden="true" />
      </span>
    </Link>
  );
}

// ── Countdown display ─────────────────────────────────────────────

function CountdownDisplay({ startTime }: { startTime: number }) {
  const target = new Date(startTime * 1000);
  const { hours, minutes, seconds, isExpired } = useCountdown(target);

  if (isExpired) {
    return <span className="text-sm font-medium text-muted">Starting soon…</span>;
  }

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <span className="text-2xl font-semibold tabular-nums tracking-tight text-accent">
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
      type="button"
      onClick={handleTap}
      className="card flex w-full flex-col gap-3 p-4 text-left transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-fg">{game.name}</p>
        <p className="mt-0.5 text-sm text-muted">{formattedDate}</p>
      </div>
      {isPast ? (
        <span className="text-sm font-medium text-muted">Starting soon…</span>
      ) : (
        <CountdownDisplay startTime={game.start_time} />
      )}
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
      type="button"
      onClick={() => router.push(`/game/${game.id}/summary`)}
      className="card flex min-h-14 w-full items-center justify-between gap-3 p-3 text-left shadow-none transition-transform duration-150 active:scale-[0.98]"
    >
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{game.name}</p>
        <p className="mt-0.5 text-xs text-muted">{endDate}</p>
      </div>
      {resultLabel && (
        <span
          className={`pill shrink-0 ${
            resultLabel === "Won" ? "pill-success" : "pill-danger"
          }`}
        >
          {resultLabel}
        </span>
      )}
    </button>
  );
}

// ── Section wrapper ───────────────────────────────────────────────

function Section({
  title,
  children,
  visible,
}: {
  title: string;
  children: React.ReactNode;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <section className="animate-[fadeIn_300ms_var(--ease-out)_both]">
      <h2 className="mb-3 px-1 text-sm font-semibold text-muted">{title}</h2>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
      <Mountains className="size-14 text-muted" aria-hidden="true" />
      <p className="max-w-xs text-base font-medium text-muted">
        No games yet - your host will set one up!
      </p>
      <button type="button" onClick={onRefresh} className="btn btn-secondary">
        Refresh
      </button>
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-8" aria-hidden="true">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <SkeletonRow tall />
        <SkeletonRow tall />
      </div>
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-28" />
        <SkeletonRow />
        <SkeletonRow />
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
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLobby();
  }, [fetchLobby]);

  const retry = useCallback(() => {
    setError(null);
    void fetchLobby();
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
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <h1 className="mb-6 text-2xl font-semibold tracking-tight text-fg">
        Your Games
      </h1>

      {error && (
        <div role="alert" className="callout callout-danger items-center justify-between">
          <span>{error}</span>
          <button type="button" onClick={retry} className="btn btn-secondary btn-sm shrink-0">
            Retry
          </button>
        </div>
      )}

      {isLoading && <LoadingSkeleton />}

      {!isLoading && isEmpty && <EmptyState onRefresh={retry} />}

      {!isLoading && !isEmpty && data && (
        <div className="flex flex-col gap-8">
          {/* ── Section 1: Active games ──────────────────────── */}
          {hasActive ? (
            <Section title="Active" visible>
              {data.active.map((g) => (
                <ActiveCard key={g.id} game={g} />
              ))}
            </Section>
          ) : (
            <section>
              <h2 className="mb-3 px-1 text-sm font-semibold text-muted">Active</h2>
              <p className="px-1 text-sm text-muted">No active game</p>
            </section>
          )}

          {/* ── Section 2: Upcoming games ────────────────────── */}
          <Section title="Upcoming" visible={hasScheduled}>
            {data.scheduled.map((g) => (
              <ScheduledCard key={g.id} game={g} />
            ))}
          </Section>

          {/* ── Section 3: Past games ────────────────────────── */}
          <Section title="Past Games" visible={hasPast}>
            {data.past.map((g) => (
              <PastCard key={g.id} game={g} />
            ))}
          </Section>
        </div>
      )}
    </div>
  );
}
