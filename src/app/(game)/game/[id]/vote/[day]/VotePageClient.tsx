"use client";

import { useEffect, useState, useCallback, useRef, memo } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  CaretDown,
  Check,
  CheckCircle,
  Eye,
  Skull,
  Timer,
} from "@phosphor-icons/react";
import { useAbly } from "@/hooks/useAbly";
import { useCountdown } from "@/hooks/useCountdown";
import { ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// ── Types ─────────────────────────────────────────────────────────

interface VotePlayer {
  id: number; // user_id
  name: string;
  avatarUrl: string | null;
  voteCount: number;
}

interface VoteEntry {
  voterId: number;
  voterName: string;
  voterAvatarUrl: string | null;
  targetId: number;
  targetName: string;
  targetAvatarUrl: string | null;
}

interface VoteResult {
  playerId: number;
  name: string;
  voteCount: number;
}

interface OpenState {
  windowOpen: true;
  day: number;
  callerUserId: number;
  /** False when the caller has the `see_killer` permission. */
  canVote: boolean;
  window_open_utc_ms: number;
  window_close_utc_ms: number;
  callerVotedFor: number | null;
  players: VotePlayer[];
  votes?: VoteEntry[];
}

interface ClosedState {
  windowOpen: false;
  day: number;
  callerUserId: number;
  window_open_utc_ms?: number;
  window_close_utc_ms?: number;
  eliminated?: { id: number; name: string } | null;
  results: VoteResult[];
  votes?: VoteEntry[];
}

type VoteData = OpenState | ClosedState;

// ── Helpers ────────────────────────────────────────────────────────

/** Formats a UTC millisecond timestamp as a local time string (HH:MM). */
function utcMsToLocalTime(utcMs: number): string {
  return new Date(utcMs).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

const pageClass = "mx-auto w-full max-w-lg space-y-6 px-4 py-6";

// ── Shared bits ───────────────────────────────────────────────────

function BackLink({ gameId }: { gameId: string }) {
  return (
    <Link href={`/game/${gameId}`} className="btn btn-ghost -ml-3">
      <ArrowLeft className="size-5" aria-hidden="true" />
      Back to board
    </Link>
  );
}

function PageTitle({ title, day }: { title: string; day: number }) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
      <p className="text-sm text-muted">Day {day}</p>
    </div>
  );
}

function Avatar({
  url,
  name,
  className,
  sizes,
  textClass,
}: {
  url: string | null;
  name: string;
  className: string;
  sizes: string;
  textClass: string;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-accent-soft ${className}`}
    >
      {url ? (
        <Image
          src={url}
          alt={name}
          fill
          sizes={sizes}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-semibold text-accent ${textClass}`}
        >
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── PlayerTile ────────────────────────────────────────────────────

function PlayerTile({
  player,
  isSelected,
  isSelf,
  totalVotes,
  onClick,
}: {
  player: VotePlayer;
  isSelected: boolean;
  isSelf: boolean;
  totalVotes: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isSelf}
      aria-pressed={isSelected}
      aria-label={`Vote for ${player.name}`}
      className={`relative flex min-h-11 flex-col items-center gap-1.5 rounded-control border p-3 transition-[border-color,background-color,transform] duration-150 active:scale-[0.98] disabled:cursor-default disabled:opacity-50 disabled:active:scale-100 ${
        isSelected
          ? "border-accent bg-accent-soft ring-1 ring-accent"
          : "border-line bg-surface"
      }`}
    >
      {isSelected && (
        <span
          aria-hidden="true"
          className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-accent text-accent-fg"
        >
          <Check className="size-3" />
        </span>
      )}
      <Avatar
        url={player.avatarUrl}
        name={player.name}
        className="size-14"
        sizes="56px"
        textClass="text-lg"
      />
      <span className="max-w-full truncate text-xs font-semibold text-fg">
        {player.name}
        {isSelf && <span className="ml-1 font-normal text-muted">(you)</span>}
      </span>
      {player.voteCount > 0 && (
        <span className="pill pill-accent">
          {player.voteCount} {player.voteCount === 1 ? "vote" : "votes"}
        </span>
      )}
      {totalVotes > 0 && player.voteCount === 0 && (
        <span className="text-xs text-muted">0 votes</span>
      )}
    </button>
  );
}

// ── VoteTileRow ───────────────────────────────────────────────────

const VoteTileRow = memo(function VoteTileRow({
  player,
  isSelected,
  isSelf,
  hasVotes,
  onSelect,
  dispatchRef,
}: {
  player: VotePlayer;
  isSelected: boolean;
  isSelf: boolean;
  hasVotes: boolean;
  onSelect: (id: number) => void;
  dispatchRef: React.MutableRefObject<Map<number, React.Dispatch<React.SetStateAction<number>>>>;
}) {
  const [voteCount, setVoteCount] = useState(player.voteCount);
  const handleClick = useCallback(() => {
    if (!isSelf) onSelect(player.id);
  }, [isSelf, onSelect, player.id]);
  useEffect(() => {
    // Server-provided count replaces the locally incremented one on refetch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVoteCount(player.voteCount);
  }, [player.voteCount]);
  useEffect(() => {
    const dispatchers = dispatchRef.current;
    dispatchers.set(player.id, setVoteCount);
    return () => { dispatchers.delete(player.id); };
  }, [player.id, dispatchRef]);
  return (
    <PlayerTile
      player={{ ...player, voteCount }}
      isSelected={isSelected}
      isSelf={isSelf}
      totalVotes={hasVotes ? 1 : 0}
      onClick={handleClick}
    />
  );
});

// ── Countdown display ─────────────────────────────────────────────

function VoteWindowCountdown({ endUtcMs }: { endUtcMs: number }) {
  const target = new Date(endUtcMs);
  const { hours, minutes, seconds, isExpired } = useCountdown(target);

  if (isExpired) return null;

  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-accent">
      <Timer className="size-4" aria-hidden="true" />
      <span className="tabular-nums">
        Closes in{" "}
        {hours > 0 && `${hours}h `}
        {minutes > 0 && `${minutes}m `}
        {String(seconds).padStart(2, "0")}s
      </span>
    </div>
  );
}

// ── VotePageClient ────────────────────────────────────────────────

interface VotePageClientProps {
  gameId: string;
  day: number;
}

export default function VotePageClient({ gameId, day }: VotePageClientProps) {
  const [data, setData] = useState<VoteData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  const [liveVotes, setLiveVotes] = useState<VoteEntry[]>([]);

  const [results, setResults] = useState<VoteResult[] | null>(null);
  const [eliminated, setEliminated] =
    useState<{ id: number; name: string } | null | undefined>(undefined);

  const [closing, setClosing] = useState(false);
  const closedRef = useRef(false);

  const countDispatchRef = useRef<Map<number, React.Dispatch<React.SetStateAction<number>>>>(new Map());
  const voterTargetRef = useRef<Map<number, number>>(new Map());
  const [hasVotes, setHasVotes] = useState(false);

  // ── Load data ──────────────────────────────────────────────

  const fetchData = useCallback(() => {
    fetch(`/api/game/${gameId}/vote`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.success) {
          setError((json.error as string) ?? "Unknown error");
          return;
        }
        const d = json.data as VoteData;
        setData(d);
        if (d.votes) setLiveVotes(d.votes);
        if (d.windowOpen) {
          if (d.votes) {
            d.votes.forEach((v) => { voterTargetRef.current.set(v.voterId, v.targetId); });
          }
          if (d.players.some((p) => p.voteCount > 0)) setHasVotes(true);
        }
        if (!d.windowOpen) {
          setResults(d.results);
          if (d.eliminated !== undefined) {
            setEliminated(d.eliminated ?? null);
          }
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (data?.windowOpen && data.callerVotedFor) {
      // Sync the selection with the server-reported vote.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedId(data.callerVotedFor);
    }
  }, [data]);

  const handleSelect = useCallback((id: number) => setSelectedId(id), []);
  const noOp = useCallback((_id: number) => {}, []);

  // ── Submit / change vote ────────────────────────────────────

  const handleConfirmVote = useCallback(async () => {
    if (selectedId === null) return;
    setSubmitting(true);
    setVoteError(null);
    setData((prev) => {
      if (!prev?.windowOpen) return prev;
      return { ...prev, callerVotedFor: selectedId };
    });
    try {
      const res = await fetch(`/api/game/${gameId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedId }),
      });
      const json = await res.json();
      if (!json.success) {
        setVoteError((json.error as string) ?? "Something went wrong");
        setData((prev) => {
          if (!prev?.windowOpen) return prev;
          return { ...prev, callerVotedFor: null };
        });
      }
    } catch {
      setVoteError("Network error. Please try again.");
      setData((prev) => {
        if (!prev?.windowOpen) return prev;
        return { ...prev, callerVotedFor: null };
      });
    } finally {
      setSubmitting(false);
    }
  }, [gameId, selectedId]);

  // ── Ably: VOTE_CAST ─────────────────────────────────────────

  const canSeeVotes = !!(data?.votes !== undefined);

  useAbly(
    ABLY_CHANNELS.vote(gameId, day),
    ABLY_EVENTS.vote_cast,
    useCallback(
      (msg) => {
        const payload = msg.data as VoteEntry;
        if (canSeeVotes) {
          setLiveVotes((prev) => {
            const idx = prev.findIndex((v) => v.voterId === payload.voterId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = payload;
              return next;
            }
            return [...prev, payload];
          });
        }
        const oldTargetId = voterTargetRef.current.get(payload.voterId) ?? null;
        voterTargetRef.current.set(payload.voterId, payload.targetId);
        countDispatchRef.current.get(payload.targetId)?.(c => c + 1);
        if (oldTargetId !== null && oldTargetId !== payload.targetId) {
          countDispatchRef.current.get(oldTargetId)?.(c => Math.max(0, c - 1));
        }
        setHasVotes(true);
        if (canSeeVotes) {
          setData((prev) => {
            if (!prev?.windowOpen) return prev;
            const existing = prev.votes ?? [];
            const idx = existing.findIndex((v) => v.voterId === payload.voterId);
            const votes = idx >= 0
              ? [...existing.slice(0, idx), payload, ...existing.slice(idx + 1)]
              : [...existing, payload];
            return { ...prev, votes };
          });
        }
      },
      [canSeeVotes],
    ),
  );

  // ── Ably: VOTE_CLOSED ───────────────────────────────────────

  useAbly(
    ABLY_CHANNELS.game(gameId),
    ABLY_EVENTS.vote_closed,
    useCallback((msg) => {
      if (closedRef.current) return;
      closedRef.current = true;
      const payload = msg.data as {
        eliminated: { id: number; name: string } | null;
        voteResults: VoteResult[];
      };
      setClosing(true);
      setTimeout(() => {
        setEliminated(payload.eliminated ?? null);
        setResults(payload.voteResults);
        setClosing(false);
      }, 300);
    }, []),
  );

  // ── Render ──────────────────────────────────────────────────

  const fade = `transition-opacity duration-300 ${closing ? "opacity-0" : "opacity-100"}`;

  if (error) {
    return (
      <div className={pageClass}>
        <BackLink gameId={gameId} />
        <div role="alert" className="callout callout-danger items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              fetchData();
            }}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={pageClass} aria-hidden="true">
        <Skeleton className="h-8 w-48" />
        <div className="player-grid player-grid-vote">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      </div>
    );
  }

  // ── Window not open: before-window message or results ─────────────

  if (!data.windowOpen) {
    // Only decides which message to show; a stale value self-corrects on refetch.
    // eslint-disable-next-line react-hooks/purity
    const nowMs = Date.now();
    const opensMs = data.window_open_utc_ms;
    const isBeforeWindow = opensMs !== undefined && nowMs < opensMs;

    if (isBeforeWindow) {
      return (
        <div className={pageClass}>
          <BackLink gameId={gameId} />
          <PageTitle title="Daily Vote" day={day} />
          <div role="status" className="callout flex-col items-center gap-1 py-5 text-center">
            <p className="font-semibold">Voting is not open yet.</p>
            <p className="text-sm text-muted">Opens at {utcMsToLocalTime(opensMs)}</p>
          </div>
        </div>
      );
    }
  }

  // ── Closed results ──────────────────────────────────────────

  if (results !== null) {
    const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);
    const maxVotes = sorted[0]?.voteCount ?? 0;
    const hasMajority = eliminated !== undefined && eliminated !== null;

    return (
      <div className={`${pageClass} ${fade}`}>
        <BackLink gameId={gameId} />
        <PageTitle title="Vote Results" day={day} />

        {eliminated ? (
          <div role="status" className="callout callout-danger items-center justify-center font-semibold">
            <Skull className="size-5 shrink-0" aria-hidden="true" />
            {eliminated.name} was eliminated by vote.
          </div>
        ) : (
          !hasMajority && (
            <div role="status" className="callout justify-center font-semibold">
              It&apos;s a tie - no one was eliminated.
            </div>
          )
        )}

        {sorted.length === 0 ? (
          <p className="py-8 text-center text-muted">No votes yet</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((r) => {
              const isEliminated = eliminated?.id === r.playerId;
              const pct = maxVotes > 0 ? (r.voteCount / maxVotes) * 100 : 0;
              return (
                <li
                  key={r.playerId}
                  className={`card overflow-hidden px-4 py-3 ${
                    isEliminated ? "border-danger" : ""
                  }`}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span
                      className={`flex items-center gap-1.5 font-semibold ${isEliminated ? "text-danger" : "text-fg"}`}
                    >
                      {isEliminated && (
                        <Skull className="size-5 shrink-0" aria-hidden="true" />
                      )}
                      {r.name}
                      {isEliminated && <span className="sr-only">(eliminated)</span>}
                    </span>
                    <span className="pill pill-accent text-sm">
                      {r.voteCount} vote{r.voteCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-elevated">
                    <div
                      className={`h-full rounded-full transition-[width] duration-700 ${
                        isEliminated ? "bg-danger" : "bg-accent"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Spy: voter -> target breakdown on closed view */}
        {liveVotes.length > 0 && (
          <SpyPanel votes={liveVotes} />
        )}
      </div>
    );
  }

  // ── Window not open ─────────────────────────────────────────

  if (!data.windowOpen) {
    return (
      <div className={pageClass}>
        <BackLink gameId={gameId} />
        <PageTitle title="Voting" day={day} />
        <div role="status" className="callout flex-col items-center gap-1 py-5 text-center">
          <p className="font-semibold">Voting is not currently open.</p>
          <p className="text-sm text-muted">
            Check back when the vote window is active.
          </p>
        </div>
      </div>
    );
  }

  // ── Active vote window ──────────────────────────────────

  const openData = data as OpenState;
  const hasConfirmedVote = openData.callerVotedFor !== null;
  const selectedChanged =
    selectedId !== null && selectedId !== openData.callerVotedFor;

  if (!openData.canVote) {
    return (
      <div className={`${pageClass} ${fade}`}>
        <BackLink gameId={gameId} />
        <div className="space-y-1">
          <PageTitle title="Vote" day={day} />
          <VoteWindowCountdown endUtcMs={openData.window_close_utc_ms} />
        </div>

        <div role="status" className="callout callout-accent flex-col gap-1">
          <p className="flex items-center gap-2 font-semibold">
            <Eye className="size-5 shrink-0 text-accent" aria-hidden="true" />
            You are an observer - you cannot vote.
          </p>
          <p className="text-sm text-muted">
            Your role grants you knowledge that would give an unfair advantage
            in the vote. You may watch the vote unfold below.
          </p>
        </div>

        {/* Read-only player grid showing live vote counts */}
        <div className="player-grid player-grid-vote">
          {openData.players.map((player) => (
            <VoteTileRow
              key={player.id}
              player={player}
              isSelected={false}
              isSelf={player.id === openData.callerUserId}
              hasVotes={hasVotes}
              onSelect={noOp}
              dispatchRef={countDispatchRef}
            />
          ))}
        </div>

        {/* Spy view: voter -> target breakdown */}
        {liveVotes.length > 0 && <SpyPanel votes={liveVotes} />}
      </div>
    );
  }

  return (
    <div className={`${pageClass} pb-[calc(6.5rem+var(--safe-bottom))] ${fade}`}>
      <BackLink gameId={gameId} />
      <div className="space-y-1">
        <PageTitle title="Vote" day={day} />
        <VoteWindowCountdown endUtcMs={openData.window_close_utc_ms} />
      </div>

      {voteError && (
        <div role="alert" className="callout callout-danger">
          {voteError}
        </div>
      )}

      {hasConfirmedVote && !selectedChanged && (
        <div role="status" className="callout callout-success items-center font-semibold">
          <CheckCircle className="size-5 shrink-0 text-success" aria-hidden="true" />
          Your vote is cast - tap another player to change it.
        </div>
      )}

      {/* Player grid */}
      <div className="player-grid player-grid-vote">
        {openData.players.map((player) => (
          <VoteTileRow
            key={player.id}
            player={player}
            isSelected={selectedId === player.id}
            isSelf={player.id === openData.callerUserId}
            hasVotes={hasVotes}
            onSelect={handleSelect}
            dispatchRef={countDispatchRef}
          />
        ))}
      </div>

      {/* Spy view: voter -> target breakdown */}
      {liveVotes.length > 0 && <SpyPanel votes={liveVotes} />}

      {/* Sticky confirm bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] backdrop-blur-md">
        <div className="mx-auto max-w-lg px-4 py-3">
          <button
            type="button"
            onClick={handleConfirmVote}
            disabled={submitting || selectedId === null || (selectedId === openData.callerVotedFor)}
            className="btn btn-primary min-h-12 w-full text-base"
          >
            {submitting ? (
              "Voting…"
            ) : selectedId === null ? (
              "Select a player"
            ) : selectedId === openData.callerVotedFor ? (
              <>
                <Check className="size-5" aria-hidden="true" />
                Voted
              </>
            ) : (
              "Confirm Vote"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── SpyPanel ──────────────────────────────────────────────────────

function SpyPanel({ votes }: { votes: VoteEntry[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center justify-between px-4 py-3 text-left"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Eye className="size-5 text-accent" aria-hidden="true" />
          Secret Info
        </span>
        <CaretDown
          className={`size-4 text-muted transition-transform duration-200${open ? " rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="space-y-2 px-4 pb-4">
          {votes.length === 0 ? (
            <p className="text-sm text-muted">No votes yet.</p>
          ) : (
            <ul className="space-y-2">
              {votes.map((v) => (
                <li
                  key={v.voterId}
                  className="flex items-center gap-2 text-sm text-fg"
                >
                  <Avatar
                    url={v.voterAvatarUrl}
                    name={v.voterName}
                    className="size-8"
                    sizes="32px"
                    textClass="text-xs"
                  />
                  <span className="truncate font-semibold">{v.voterName}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted" aria-hidden="true" />
                  <Avatar
                    url={v.targetAvatarUrl}
                    name={v.targetName}
                    className="size-8"
                    sizes="32px"
                    textClass="text-xs"
                  />
                  <span className="truncate font-semibold">{v.targetName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
