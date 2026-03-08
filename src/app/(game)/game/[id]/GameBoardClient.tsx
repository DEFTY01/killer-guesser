"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VoteCountdown } from "@/components/game/VoteCountdown";
import { PlayerCard, type PlayerCardPlayer } from "@/components/game/PlayerCard";
import type { RolePermission } from "@/lib/role-constants";
import { useAbly } from "@/hooks/useAbly";
import { ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";

// ── Types ─────────────────────────────────────────────────────────

interface GameInfo {
  id: string;
  name: string;
  team1_name: string;
  team2_name: string;
  vote_window_start: string | null;
  vote_window_end: string | null;
  current_day: number;
}

interface SettingsInfo {
  murder_item_url: string | null;
  murder_item_name: string | null;
}

interface CallerInfo {
  game_player_id: number;
  user_id: number;
  permissions: RolePermission[];
}

interface BoardData {
  game: GameInfo;
  settings: SettingsInfo;
  caller: CallerInfo;
  players: PlayerCardPlayer[];
  killer_id?: number | null;
  votes?: Array<{ voter_id: number; target_id: number }>;
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

// ── Murder item card ──────────────────────────────────────────────

function MurderItemCard({ url, name }: { url: string | null; name: string | null }) {
  if (!url && !name) return null;

  return (
    <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden max-w-xs mx-auto">
      {url && (
        <div className="relative w-full aspect-square bg-gray-50">
          <Image
            src={url}
            alt={name ?? "Murder item"}
            fill
            sizes="(max-width: 320px) 100vw, 320px"
            className="object-contain p-4"
          />
        </div>
      )}
      {name && (
        <div className="px-4 py-3 text-center">
          <p className="text-sm font-semibold text-gray-800">{name}</p>
          <p className="text-xs text-gray-400 mt-0.5">Murder weapon</p>
        </div>
      )}
    </div>
  );
}

// ── Self-death modal ───────────────────────────────────────────────

interface SelfDeathModalProps {
  gameId: string;
  gamePlayerId: number;
  onConfirmed: () => void;
  onClose: () => void;
}

function SelfDeathModal({
  gameId,
  gamePlayerId,
  onConfirmed,
  onClose,
}: SelfDeathModalProps) {
  const [step, setStep] = useState<"confirm" | "form">("confirm");
  const [location, setLocation] = useState("");
  const [timeOfDay, setTimeOfDay] = useState<
    "morning" | "afternoon" | "evening"
  >("morning");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!location.trim()) {
        setError("Please enter a location.");
        return;
      }
      setSubmitting(true);
      setError(null);

      try {
        const res = await fetch(
          `/api/game/${gameId}/players/${gamePlayerId}/die`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ location: location.trim(), time_of_day: timeOfDay }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          setError(json.error ?? "Something went wrong");
          return;
        }
        onConfirmed();
      } catch {
        setError("Network error. Please try again.");
      } finally {
        setSubmitting(false);
      }
    },
    [gameId, gamePlayerId, location, timeOfDay, onConfirmed],
  );

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="death-modal-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-6">
        {step === "confirm" ? (
          <>
            <h2
              id="death-modal-title"
              className="text-lg font-bold text-gray-900 mb-4 text-center"
            >
              Did you die?
            </h2>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("form")}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                Yes
              </button>
              <button
                onClick={onClose}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                No
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2
              id="death-modal-title"
              className="text-lg font-bold text-gray-900 mb-4 text-center"
            >
              Where did it happen?
            </h2>

            {error && (
              <p role="alert" className="mb-3 text-sm text-red-600 text-center">
                {error}
              </p>
            )}

            <label className="block mb-3">
              <span className="block text-sm font-medium text-gray-700 mb-1">
                Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. The kitchen"
                maxLength={200}
                required
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </label>

            <label className="block mb-5">
              <span className="block text-sm font-medium text-gray-700 mb-1">
                Time of day
              </span>
              <select
                value={timeOfDay}
                onChange={(e) =>
                  setTimeOfDay(
                    e.target.value as "morning" | "afternoon" | "evening",
                  )
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="morning">Morning</option>
                <option value="afternoon">Afternoon</option>
                <option value="evening">Evening</option>
              </select>
            </label>

            <div className="flex gap-3">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-gray-400 focus:ring-offset-2"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Skeleton card ─────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-gray-100 p-3 animate-pulse">
      <div className="w-16 h-16 rounded-full bg-gray-200" />
      <div className="h-3 w-20 rounded-full bg-gray-200" />
      <div className="h-4 w-14 rounded-full bg-gray-200" />
    </div>
  );
}

// ── GameBoardClient ───────────────────────────────────────────────

interface GameBoardClientProps {
  gameId: string;
}

export default function GameBoardClient({ gameId }: GameBoardClientProps) {
  const router = useRouter();
  const [data, setData] = useState<BoardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDeathModal, setShowDeathModal] = useState(false);
  const [voteActive, setVoteActive] = useState(false);
  const [gameEnded, setGameEnded] = useState<string | null | false>(false);

  // ── Load board data ─────────────────────────────────────────

  const fetchBoard = useCallback(() => {
    fetch(`/api/game/${gameId}/board`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load board");
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          setData(json.data as BoardData);
        } else {
          setError((json.error as string) ?? "Unknown error");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // ── Track vote window ───────────────────────────────────────

  useEffect(() => {
    if (!data) return;
    const { vote_window_start, vote_window_end } = data.game;
    function checkWindow() {
      setVoteActive(isVoteWindowActive(vote_window_start, vote_window_end));
    }
    checkWindow();
    const id = setInterval(checkWindow, 5000);
    return () => clearInterval(id);
  }, [data]);

  // ── Optimistic death update ─────────────────────────────────

  const handleDeathConfirmed = useCallback(() => {
    setShowDeathModal(false);
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map((p) =>
          p.user_id === prev.caller.user_id
            ? { ...p, is_dead: 1, revived_at: null }
            : p,
        ),
      };
    });
  }, []);

  // ── Revive handler ──────────────────────────────────────────

  const handleRevive = useCallback(
    async (gamePlayerId: number) => {
      const res = await fetch(
        `/api/game/${gameId}/players/${gamePlayerId}/revive`,
        { method: "POST" },
      );
      const json = await res.json();
      if (json.success) {
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: prev.players.map((p) =>
              p.id === gamePlayerId
                ? { ...p, is_dead: 0, revived_at: Math.floor(Date.now() / 1000) }
                : p,
            ),
          };
        });
      }
    },
    [gameId],
  );

  const isLoading = data === null && error === null;

  // ── Derived values ──────────────────────────────────────────

  const canRevive = data?.caller.permissions.includes("revive_dead") ?? false;
  const canSeeKiller = data?.caller.permissions.includes("see_killer") ?? false;

  // ── Ably: PLAYER_DIED ───────────────────────────────────────

  useAbly(
    ABLY_CHANNELS.game(gameId),
    ABLY_EVENTS.player_died,
    useCallback((msg) => {
      const { player_id } = msg.data as { player_id: number };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.user_id === player_id
              ? { ...p, is_dead: 1, revived_at: null }
              : p,
          ),
        };
      });
    }, []),
  );

  // ── Ably: PLAYER_REVIVED ────────────────────────────────────

  useAbly(
    ABLY_CHANNELS.game(gameId),
    ABLY_EVENTS.player_revived,
    useCallback((msg) => {
      const { game_player_id, revived_at } = msg.data as {
        player_id: number;
        game_player_id: number;
        revived_at: number;
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === game_player_id
              ? { ...p, is_dead: 0, revived_at }
              : p,
          ),
        };
      });
    }, []),
  );

  // ── Ably: GAME_ENDED ────────────────────────────────────────

  useAbly(
    ABLY_CHANNELS.game(gameId),
    ABLY_EVENTS.game_ended,
    useCallback(
      (msg) => {
        const { winner_team } = msg.data as { winner_team: string | null };
        setGameEnded(winner_team ?? null);
        setTimeout(() => {
          router.push("/");
        }, 3000);
      },
      [router],
    ),
  );

  // ── Render ──────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      {/* ── Vote countdown ───────────────────────────────────── */}
      {data && (
        <VoteCountdown
          voteWindowStart={data.game.vote_window_start}
          voteWindowEnd={data.game.vote_window_end}
        />
      )}

      {/* ── Game title ───────────────────────────────────────── */}
      {isLoading ? (
        <div className="h-7 w-48 rounded-full bg-gray-200 animate-pulse" />
      ) : (
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {data?.game.name ?? "Game"}
        </h1>
      )}

      {/* ── Error state ─────────────────────────────────────── */}
      {error && (
        <div
          role="alert"
          className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600"
        >
          {error}
        </div>
      )}

      {/* ── Murder item card ─────────────────────────────────── */}
      {data && (
        <MurderItemCard
          url={data.settings.murder_item_url}
          name={data.settings.murder_item_name}
        />
      )}

      {/* ── Player grid ─────────────────────────────────────── */}
      {isLoading && (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {data && data.players.length === 0 && (
        <p className="text-center text-gray-400 py-12">
          No players yet — check back soon!
        </p>
      )}

      {data && data.players.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {data.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isOwnCard={player.user_id === data.caller.user_id}
              isKiller={canSeeKiller && data.killer_id != null && player.user_id === data.killer_id}
              canRevive={canRevive}
              onSelfTap={() => setShowDeathModal(true)}
              onRevive={handleRevive}
            />
          ))}
        </div>
      )}

      {/* ── Vote button ─────────────────────────────────────── */}
      {data && voteActive && (
        <div className="flex justify-center pt-2">
          <Link
            href={`/game/${gameId}/vote/${data.game.current_day}`}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-6 py-3 text-base font-semibold text-white shadow-md hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          >
            🗳 Vote
          </Link>
        </div>
      )}

      {/* ── Self-death modal ─────────────────────────────────── */}
      {showDeathModal && data && (
        <SelfDeathModal
          gameId={gameId}
          gamePlayerId={data.caller.game_player_id}
          onConfirmed={handleDeathConfirmed}
          onClose={() => setShowDeathModal(false)}
        />
      )}

      {/* ── Game-ended modal ─────────────────────────────────── */}
      {gameEnded !== false && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="game-ended-title"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl p-8 text-center space-y-4">
            <div className="text-5xl">🏆</div>
            <h2
              id="game-ended-title"
              className="text-xl font-bold text-gray-900"
            >
              Game Over!
            </h2>
            {gameEnded ? (
              <p className="text-gray-600">
                <span className="font-semibold text-gray-900">{gameEnded}</span>{" "}
                wins!
              </p>
            ) : (
              <p className="text-gray-600">The game has ended.</p>
            )}
            <p className="text-sm text-gray-400">
              Redirecting to home in a moment…
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
