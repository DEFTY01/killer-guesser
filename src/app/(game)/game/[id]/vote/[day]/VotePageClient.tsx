"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAbly } from "@/hooks/useAbly";
import { useCountdown } from "@/hooks/useCountdown";
import { ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

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
  vote_window_start: string;
  vote_window_end: string;
  callerVotedFor: number | null;
  players: VotePlayer[];
  votes?: VoteEntry[];
}

interface ClosedState {
  windowOpen: false;
  day: number;
  callerUserId: number;
  vote_window_start: string | null;
  vote_window_end: string | null;
  results: VoteResult[];
  votes?: VoteEntry[];
}

type VoteData = OpenState | ClosedState;

// ── Helpers ────────────────────────────────────────────────────────

/** Build a Date for today at the given UTC HH:MM. */
function todayAt(hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date();
  d.setUTCHours(h, m, 0, 0);
  return d;
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
      className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 p-3 transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-default ${
        isSelected
          ? "border-indigo-500 bg-indigo-50 shadow-md"
          : "border-gray-200 bg-white hover:border-indigo-300 hover:shadow-sm"
      }`}
    >
      <div className="relative w-14 h-14 rounded-full overflow-hidden bg-gray-100 shrink-0">
        {player.avatarUrl ? (
          <Image
            src={player.avatarUrl}
            alt={player.name}
            fill
            sizes="56px"
            className="object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-lg font-bold text-gray-500">
            {player.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>
      <span className="text-xs font-semibold text-gray-900 truncate max-w-full">
        {player.name}
        {isSelf && <span className="ml-1 text-gray-400">(you)</span>}
      </span>
      {player.voteCount > 0 && (
        <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
          {player.voteCount} {player.voteCount === 1 ? "vote" : "votes"}
        </span>
      )}
      {totalVotes > 0 && player.voteCount === 0 && (
        <span className="text-xs text-gray-300">0 votes</span>
      )}
    </button>
  );
}

// ── Countdown display ─────────────────────────────────────────────

function VoteWindowCountdown({ endHhmm }: { endHhmm: string }) {
  const target = todayAt(endHhmm);
  const { hours, minutes, seconds, isExpired } = useCountdown(target);

  if (isExpired) return null;

  return (
    <div className="flex items-center justify-center gap-1 text-sm text-amber-700 font-semibold">
      <span aria-hidden="true">⏱</span>
      <span>
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

  // Selected suspect (before confirming)
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);

  // Live votes for spy view
  const [liveVotes, setLiveVotes] = useState<VoteEntry[]>([]);

  // Results after close
  const [results, setResults] = useState<VoteResult[] | null>(null);
  const [eliminated, setEliminated] =
    useState<{ id: number; name: string } | null | undefined>(undefined);

  // Crossfade transition state
  const [closing, setClosing] = useState(false);
  const closedRef = useRef(false);

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
        if (!d.windowOpen) {
          setResults(d.results);
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Pre-select the player the caller already voted for
  useEffect(() => {
    if (data?.windowOpen && data.callerVotedFor) {
      setSelectedId(data.callerVotedFor);
    }
  }, [data]);

  // ── Submit / change vote ────────────────────────────────────

  const handleConfirmVote = useCallback(async () => {
    if (selectedId === null) return;
    setSubmitting(true);
    setVoteError(null);
    try {
      const res = await fetch(`/api/game/${gameId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId: selectedId }),
      });
      const json = await res.json();
      if (!json.success) {
        setVoteError((json.error as string) ?? "Something went wrong");
        return;
      }
      // Optimistically update callerVotedFor
      setData((prev) => {
        if (!prev?.windowOpen) return prev;
        return { ...prev, callerVotedFor: selectedId };
      });
    } catch {
      setVoteError("Network error. Please try again.");
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
        // Update spy list
        if (canSeeVotes) {
          setLiveVotes((prev) => {
            // Replace if same voter, otherwise append
            const idx = prev.findIndex((v) => v.voterId === payload.voterId);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = payload;
              return next;
            }
            return [...prev, payload];
          });
        }
        // Update aggregate counts on player tiles
        setData((prev) => {
          if (!prev?.windowOpen) return prev;
          // Find old target for this voter and decrement, then increment new
          const oldVote = prev.votes?.find((v) => v.voterId === payload.voterId);
          const oldTargetId = oldVote?.targetId ?? null;
          return {
            ...prev,
            players: prev.players.map((p) => {
              let delta = 0;
              if (p.id === payload.targetId) delta += 1;
              if (oldTargetId !== null && p.id === oldTargetId) delta -= 1;
              return delta !== 0
                ? { ...p, voteCount: Math.max(0, p.voteCount + delta) }
                : p;
            }),
            votes: canSeeVotes
              ? (() => {
                  const existing = prev.votes ?? [];
                  const idx = existing.findIndex(
                    (v) => v.voterId === payload.voterId,
                  );
                  if (idx >= 0) {
                    const next = [...existing];
                    next[idx] = payload;
                    return next;
                  }
                  return [...existing, payload];
                })()
              : prev.votes,
          };
        });
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

  if (error) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6">
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600"
        >
          {error}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 animate-pulse">
        <div className="h-7 w-48 rounded-full bg-gray-200" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 rounded-2xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  // ── Closed results ──────────────────────────────────────────

  if (results !== null) {
    const sorted = [...results].sort((a, b) => b.voteCount - a.voteCount);
    const maxVotes = sorted[0]?.voteCount ?? 0;
    const hasMajority = eliminated !== undefined && eliminated !== null;

    return (
      <div
        className="max-w-2xl mx-auto px-4 py-6 space-y-6"
        style={{
          transition: "opacity 0.3s ease",
          opacity: closing ? 0 : 1,
        }}
      >
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Vote Results</h1>
          <p className="text-sm text-gray-500">Day {day}</p>
        </div>

        {eliminated ? (
          <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-center text-red-700 font-semibold">
            ☠ {eliminated.name} was eliminated by vote.
          </div>
        ) : (
          !hasMajority && (
            <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-center text-amber-700 font-semibold">
              No majority — no one was eliminated.
            </div>
          )
        )}

        {sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No votes were cast.</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((r) => {
              const isEliminated = eliminated?.id === r.playerId;
              const pct = maxVotes > 0 ? (r.voteCount / maxVotes) * 100 : 0;
              return (
                <li
                  key={r.playerId}
                  className={`rounded-xl border px-4 py-3 shadow-sm overflow-hidden ${
                    isEliminated
                      ? "border-red-300 bg-red-50"
                      : "border-gray-100 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span
                      className={`font-semibold ${isEliminated ? "text-red-700" : "text-gray-900"}`}
                    >
                      {isEliminated && (
                        <span aria-hidden="true" className="mr-1">
                          ☠
                        </span>
                      )}
                      {r.name}
                    </span>
                    <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
                      {r.voteCount} vote{r.voteCount !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        isEliminated ? "bg-red-400" : "bg-indigo-400"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {/* Spy: voter→target breakdown on closed view */}
        {liveVotes.length > 0 && (
          <SpyPanel votes={liveVotes} />
        )}

        <div className="flex justify-center">
          <Link
            href={`/game/${gameId}`}
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            ← Back to board
          </Link>
        </div>
      </div>
    );
  }

  // ── Window not open ─────────────────────────────────────────

  if (!data.windowOpen) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Voting</h1>
          <p className="text-sm text-gray-500">Day {day}</p>
        </div>
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-6 text-center text-amber-800">
          <p className="font-semibold">Voting is not currently open.</p>
          <p className="text-sm mt-1 text-amber-600">
            Check back when the vote window is active.
          </p>
        </div>
        <div className="flex justify-center">
          <Link
            href={`/game/${gameId}`}
            className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
          >
            ← Back to board
          </Link>
        </div>
      </div>
    );
  }

  // ── Active vote window ──────────────────────────────────────

  const openData = data as OpenState;
  const totalVotes = openData.players.reduce(
    (sum, p) => sum + p.voteCount,
    0,
  );
  const hasConfirmedVote = openData.callerVotedFor !== null;
  const selectedChanged =
    selectedId !== null && selectedId !== openData.callerVotedFor;

  return (
    <div
      className="max-w-2xl mx-auto px-4 py-6 space-y-6"
      style={{ transition: "opacity 0.3s ease", opacity: closing ? 0 : 1 }}
    >
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Vote</h1>
        <p className="text-sm text-gray-500">Day {day}</p>
        <VoteWindowCountdown endHhmm={openData.vote_window_end} />
      </div>

      {voteError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 text-center"
        >
          {voteError}
        </div>
      )}

      {hasConfirmedVote && !selectedChanged && (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-center text-green-700 text-sm font-semibold">
          ✓ Your vote is cast — tap another player to change it.
        </div>
      )}

      {/* Player grid */}
      <div className="grid grid-cols-3 gap-3">
        {openData.players.map((player) => {
          const isSelf = player.id === openData.callerUserId;
          return (
            <PlayerTile
              key={player.id}
              player={player}
              isSelected={selectedId === player.id}
              isSelf={isSelf}
              totalVotes={totalVotes}
              onClick={() => {
                if (!isSelf) setSelectedId(player.id);
              }}
            />
          );
        })}
      </div>

      {/* Confirm button */}
      <div className="flex justify-center">
        <button
          type="button"
          onClick={handleConfirmVote}
          disabled={submitting || selectedId === null || (selectedId === openData.callerVotedFor)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-8 py-3 text-base font-semibold text-white shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
        >
          {submitting
            ? "Voting…"
            : selectedId === null
              ? "Select a player"
              : selectedId === openData.callerVotedFor
                ? "✓ Voted"
                : "Confirm Vote"}
        </button>
      </div>

      {/* Spy view: voter→target breakdown */}
      {liveVotes.length > 0 && <SpyPanel votes={liveVotes} />}

      <div className="flex justify-center">
        <Link
          href={`/game/${gameId}`}
          className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
        >
          ← Back to board
        </Link>
      </div>
    </div>
  );
}

// ── SpyPanel ──────────────────────────────────────────────────────

function SpyPanel({ votes }: { votes: VoteEntry[] }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-gray-700">
          Secret Info 🕵️
        </span>
        <span
          className={`text-gray-400 text-xs transition-transform duration-200 inline-block${open ? " rotate-180" : ""}`}
          aria-hidden="true"
        >
          ▼
        </span>
      </button>
      {open && (
        <div className="px-4 pb-4 space-y-2">
          {votes.length === 0 ? (
            <p className="text-sm text-gray-400">No votes yet.</p>
          ) : (
            <ul className="space-y-2">
              {votes.map((v) => (
                <li
                  key={v.voterId}
                  className="flex items-center gap-2 text-sm text-gray-700"
                >
                  <MiniAvatar url={v.voterAvatarUrl} name={v.voterName} />
                  <span className="font-semibold truncate">{v.voterName}</span>
                  <span className="text-gray-400" aria-hidden="true">
                    →
                  </span>
                  <MiniAvatar url={v.targetAvatarUrl} name={v.targetName} />
                  <span className="font-semibold truncate">{v.targetName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MiniAvatar({
  url,
  name,
}: {
  url: string | null;
  name: string;
}) {
  return (
    <div className="relative w-8 h-8 rounded-full overflow-hidden bg-gray-200 shrink-0">
      {url ? (
        <Image src={url} alt={name} fill sizes="32px" className="object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-xs font-bold text-gray-500">
          {name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
}
