"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAbly } from "@/hooks/useAbly";
import { ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import type { RolePermission } from "@/lib/role-constants";

// ── Types ─────────────────────────────────────────────────────────

interface VotePlayer {
  id: number;
  user_id: number;
  name: string;
  avatar_url: string | null;
  is_dead: number;
  revived_at: number | null;
  role_color: string;
}

interface VoteEntry {
  voter_id: number;
  voter_name: string;
  target_id: number;
  target_name: string;
}

interface VoteResult {
  target_id: number;
  target_name: string;
  vote_count: number;
}

interface GameInfo {
  id: string;
  name: string;
  team1_name: string;
  team2_name: string;
  vote_window_start: string | null;
  vote_window_end: string | null;
  current_day: number;
}

interface CallerInfo {
  user_id: number;
  game_player_id: number;
  permissions: RolePermission[];
}

interface VotePageData {
  game: GameInfo;
  caller: CallerInfo;
  players: VotePlayer[];
  has_voted: boolean;
  votes?: VoteEntry[];
}

// ── Helpers ────────────────────────────────────────────────────────

function isVoteWindowActive(
  start: string | null,
  end: string | null,
): boolean {
  if (!start || !end) return false;
  const now = Date.now();
  const startMs = Date.parse(start);
  const endMs = Date.parse(end);
  if (isNaN(startMs) || isNaN(endMs)) return false;
  return now >= startMs && now < endMs;
}

// ── VotePageClient ────────────────────────────────────────────────

interface VotePageClientProps {
  gameId: string;
  day: number;
}

export default function VotePageClient({ gameId, day }: VotePageClientProps) {
  const [data, setData] = useState<VotePageData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hasVoted, setHasVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [voteActive, setVoteActive] = useState(false);

  // Real-time spy list of votes (see_votes permission)
  const [liveVotes, setLiveVotes] = useState<VoteEntry[]>([]);

  // Results view state (shown after VOTE_CLOSED)
  const [results, setResults] = useState<VoteResult[] | null>(null);

  // Track whether we've already called the close endpoint
  const closedRef = useRef(false);
  const [closeError, setCloseError] = useState<string | null>(null);

  // ── Load vote page data ─────────────────────────────────────

  const fetchData = useCallback(() => {
    fetch(`/api/game/${gameId}/vote/${day}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load vote data");
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          const d = json.data as VotePageData;
          setData(d);
          setHasVoted(d.has_voted);
          if (d.votes) {
            setLiveVotes(d.votes);
          }
        } else {
          setError((json.error as string) ?? "Unknown error");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [gameId, day]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ── Track vote window ───────────────────────────────────────

  useEffect(() => {
    if (!data) return;
    const { vote_window_start, vote_window_end } = data.game;

    function checkWindow() {
      const active = isVoteWindowActive(vote_window_start, vote_window_end);
      setVoteActive(active);

      // When window expires, trigger close once
      if (!active && !closedRef.current && vote_window_end) {
        const endMs = Date.parse(vote_window_end);
        if (!isNaN(endMs) && Date.now() >= endMs) {
          closedRef.current = true;
          fetch(`/api/game/${gameId}/vote/${day}/close`, { method: "POST" })
            .then((r) => r.json())
            .then((json) => {
              if (json.success) {
                setResults(json.data.results as VoteResult[]);
              } else {
                setCloseError(
                  (json.error as string) ??
                    "Failed to close voting. Please try again or contact an administrator.",
                );
              }
            })
            .catch(() => {
              setCloseError(
                "Failed to close voting. Please try again or contact an administrator.",
              );
            });
        }
      }
    }

    checkWindow();
    const id = setInterval(checkWindow, 1000);
    return () => clearInterval(id);
  }, [data, gameId, day]);

  // ── Submit vote ─────────────────────────────────────────────

  const handleVote = useCallback(
    async (targetId: number) => {
      setSubmitting(true);
      setVoteError(null);
      try {
        const res = await fetch(`/api/game/${gameId}/vote/${day}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target_id: targetId }),
        });
        const json = await res.json();
        if (!json.success) {
          setVoteError((json.error as string) ?? "Something went wrong");
          return;
        }
        setHasVoted(true);
      } catch {
        setVoteError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [gameId, day],
  );

  // ── Ably: VOTE_CAST (spy view) ──────────────────────────────

  const canSeeVotes =
    data?.caller.permissions.includes("see_votes") ?? false;

  useAbly(
    ABLY_CHANNELS.vote(gameId, day),
    ABLY_EVENTS.vote_cast,
    useCallback(
      (msg) => {
        if (!canSeeVotes) return;
        const payload = msg.data as VoteEntry;
        setLiveVotes((prev) => [...prev, payload]);
      },
      [canSeeVotes],
    ),
  );

  // ── Ably: VOTE_CLOSED ───────────────────────────────────────

  useAbly(
    ABLY_CHANNELS.game(gameId),
    ABLY_EVENTS.vote_closed,
    useCallback((msg) => {
      const payload = msg.data as { results: VoteResult[] };
      setResults(payload.results);
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
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  // ── Results view ────────────────────────────────────────────

  if (results !== null) {
    const sorted = [...results].sort((a, b) => b.vote_count - a.vote_count);
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Vote Results</h1>
          <p className="text-sm text-gray-500">
            {data.game.name} — Day {day}
          </p>
        </div>

        {sorted.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No votes were cast.</p>
        ) : (
          <ul className="space-y-3">
            {sorted.map((r, i) => (
              <li
                key={r.target_id}
                className="flex items-center justify-between rounded-xl border border-gray-100 bg-white px-4 py-3 shadow-sm"
              >
                <span className="flex items-center gap-3">
                  <span className="text-lg font-bold text-gray-400">
                    #{i + 1}
                  </span>
                  <span className="font-semibold text-gray-900">
                    {r.target_name}
                  </span>
                </span>
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-sm font-semibold text-indigo-700">
                  {r.vote_count} vote{r.vote_count !== 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
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

  // ── Vote window not active ──────────────────────────────────

  if (!voteActive) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-2xl font-bold text-gray-900">Voting</h1>
          <p className="text-sm text-gray-500">
            {data.game.name} — Day {day}
          </p>
        </div>

        {closeError && (
          <div
            role="alert"
            className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 text-center"
          >
            {closeError}
          </div>
        )}

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

  const alivePlayers = data.players.filter(
    (p) => p.is_dead === 0 || p.revived_at !== null,
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div className="text-center space-y-1">
        <h1 className="text-2xl font-bold text-gray-900">Vote</h1>
        <p className="text-sm text-gray-500">
          {data.game.name} — Day {day}
        </p>
      </div>

      {voteError && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600 text-center"
        >
          {voteError}
        </div>
      )}

      {hasVoted ? (
        <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-6 text-center text-green-800">
          <p className="font-semibold text-lg">✓ Your vote has been cast.</p>
          <p className="text-sm mt-1 text-green-600">
            Waiting for the vote window to close…
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm font-medium text-gray-700 text-center">
            Choose who to vote out:
          </p>
          <div className="grid grid-cols-2 gap-3">
            {alivePlayers.map((player) => {
              const isSelf = player.user_id === data.caller.user_id;
              return (
                <button
                  key={player.id}
                  onClick={() => !isSelf && handleVote(player.user_id)}
                  disabled={submitting || isSelf}
                  className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-left shadow-sm transition-all hover:border-indigo-400 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1"
                  aria-label={`Vote for ${player.name}`}
                >
                  <div className="relative w-10 h-10 rounded-full overflow-hidden bg-gray-100 shrink-0">
                    {player.avatar_url ? (
                      <Image
                        src={player.avatar_url}
                        alt={player.name}
                        fill
                        sizes="40px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-sm font-bold text-gray-500">
                        {player.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-gray-900 truncate">
                    {player.name}
                    {isSelf && (
                      <span className="ml-1 text-xs text-gray-400">(you)</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Spy view: live vote list ─────────────────────────── */}
      {canSeeVotes && (
        <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            Live votes (secret view)
          </h2>
          {liveVotes.length === 0 ? (
            <p className="text-sm text-gray-400">No votes yet.</p>
          ) : (
            <ul className="space-y-1">
              {liveVotes.map((v, i) => (
                <li key={i} className="text-sm text-gray-700">
                  <span className="font-semibold">{v.voter_name}</span>
                  {" → "}
                  <span className="font-semibold">{v.target_name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
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
