"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { VoteCountdown } from "@/components/game/VoteCountdown";
import { PlayerCard, type PlayerCardPlayer } from "@/components/game/PlayerCard";
import type { RolePermission } from "@/lib/role-constants";
import { isKiller } from "@/lib/roleUtils";
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
  role_name: string | null;
  is_dead: number;
  revived_at: number | null;
  has_tipped: number;
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
  const now = new Date();
  const currentMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  return currentMin >= sh * 60 + sm && currentMin < eh * 60 + em;
}

// ── Murder item fullscreen modal ──────────────────────────────────

function MurderItemModal({
  url,
  name,
  onClose,
}: {
  url: string;
  name: string | null;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-md bg-black/70"
      role="dialog"
      aria-modal="true"
      aria-label={name ?? "Murder item fullscreen view"}
      onClick={onClose}
      onKeyDown={(e) => { if (e.key === "Escape") onClose(); }}
      tabIndex={-1}
    >
      <div className="relative w-full h-full flex items-center justify-center p-6">
        <Image
          src={url}
          alt={name ?? "Murder item"}
          fill
          sizes="100vw"
          className="object-contain"
          onClick={(e) => e.stopPropagation()}
          unoptimized
        />
      </div>
    </div>
  );
}

// ── Murder item card ──────────────────────────────────────────────

function MurderItemCard({ url, name }: { url: string | null; name: string | null }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!url && !name) return null;

  return (
    <>
      <div className="rounded-2xl bg-white border border-gray-100 shadow-sm overflow-hidden max-w-xs mx-auto">
        <div className="px-4 pt-3 pb-1 text-center">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
            The killer&apos;s weapon:
          </p>
        </div>
        {url && (
          <button
            type="button"
            aria-label="View murder weapon fullscreen"
            onClick={() => setModalOpen(true)}
            className="relative w-full aspect-square bg-gray-50 block cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
          >
            <Image
              src={url}
              alt={name ?? "Murder item"}
              fill
              sizes="(max-width: 320px) 100vw, 320px"
              className="object-contain p-4"
              unoptimized
            />
          </button>
        )}
        {name && (
          <div className="px-4 py-3 text-center">
            <p className="text-sm font-bold text-gray-800">{name}</p>
          </div>
        )}
      </div>

      {modalOpen && url && (
        <MurderItemModal
          url={url}
          name={name}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
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
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-indigo-500"
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

// ── KillerGuessModal ──────────────────────────────────────────────

interface GuessPlayer {
  id: number;       // game_player.id
  user_id: number;
  name: string;
  avatar_url: string | null;
  is_dead: number;
  revived_at: number | null;
}

type GuessScreen = 1 | 2 | 3;

interface KillerGuessModalProps {
  gameId: string;
  players: GuessPlayer[];
  callerUserId: number;
  onClose: () => void;
  onWrongGuess: (callerUserId: number) => void;
}

function KillerGuessModal({
  gameId,
  players,
  callerUserId,
  onClose,
  onWrongGuess,
}: KillerGuessModalProps) {
  const router = useRouter();
  const [screen, setScreen] = useState<GuessScreen>(1);
  const [suspect, setSuspect] = useState<GuessPlayer | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [correct, setCorrect] = useState<boolean | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);

  const alivePlayers = players.filter(
    (p) => (p.is_dead === 0 || p.revived_at !== null) && p.user_id !== callerUserId,
  );

  const handleAccuse = useCallback(async () => {
    if (!suspect) return;
    setSubmitting(true);
    setApiError(null);
    try {
      const res = await fetch(`/api/game/${gameId}/tip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suspectId: suspect.user_id }),
      });
      const json = await res.json();
      if (!json.success) {
        setApiError((json.error as string) ?? "Something went wrong");
        setScreen(1);
        return;
      }
      const isCorrect = (json.data as { correct: boolean }).correct;
      setCorrect(isCorrect);
      setScreen(3);
      if (!isCorrect) {
        onWrongGuess(callerUserId);
        setTimeout(() => onClose(), 3000);
      } else {
        setTimeout(() => router.push("/lobby"), 3000);
      }
    } catch {
      setApiError("Network error. Please try again.");
      setScreen(1);
    } finally {
      setSubmitting(false);
    }
  }, [gameId, suspect, callerUserId, onClose, onWrongGuess, router]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="killer-guess-title"
    >
      <div className="w-full max-w-sm rounded-2xl bg-white shadow-xl overflow-hidden">
        {/* Sliding screens */}
        <div className="relative overflow-hidden">
          {/* Screen 1: Suspect grid */}
          <div
            className="modal-slide-screen"
            style={{
              transform: screen === 1 ? "translateX(0)" : "translateX(-100%)",
              transition: "transform 0.2s ease",
              position: screen === 1 ? "relative" : "absolute",
              inset: 0,
            }}
          >
            {screen === 1 && (
              <div className="p-6 space-y-4">
                <h2
                  id="killer-guess-title"
                  className="text-lg font-bold text-gray-900 text-center"
                >
                  🔍 Who is the killer?
                </h2>
                {apiError && (
                  <p role="alert" className="text-sm text-red-600 text-center">
                    {apiError}
                  </p>
                )}
                <div className="player-grid max-h-72 overflow-y-auto">
                  {alivePlayers.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSuspect(p);
                        setScreen(2);
                      }}
                      className="flex flex-col items-center gap-1 rounded-xl border-2 border-gray-200 bg-white p-2 min-h-[44px] hover:border-indigo-400 hover:shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-100">
                        {p.avatar_url ? (
                          <Image
                            src={p.avatar_url}
                            alt={p.name}
                            fill
                            sizes="48px"
                            className="object-cover"
                          />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center text-base font-bold text-gray-500">
                            {p.name.charAt(0).toUpperCase()}
                          </span>
                        )}
                      </div>
                      <span className="text-xs font-semibold text-gray-800 truncate max-w-full">
                        {p.name}
                      </span>
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Screen 2: Confirm accusation */}
          {screen === 2 && suspect && (
            <div className="p-6 space-y-5 text-center">
              <h2
                id="killer-guess-title"
                className="text-lg font-bold text-gray-900"
              >
                Accuse {suspect.name}?
              </h2>
              <div className="flex justify-center">
                <div className="relative w-20 h-20 rounded-full overflow-hidden bg-gray-100 border-4 border-gray-200">
                  {suspect.avatar_url ? (
                    <Image
                      src={suspect.avatar_url}
                      alt={suspect.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl font-bold text-gray-500">
                      {suspect.name.charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
                ⚠️ If you&apos;re wrong, you die!
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setScreen(1)}
                  disabled={submitting}
                  className="flex-1 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAccuse}
                  disabled={submitting}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50 transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                >
                  {submitting ? "Accusing…" : "Accuse them"}
                </button>
              </div>
            </div>
          )}

          {/* Screen 3: Result */}
          {screen === 3 && correct !== null && (
            <div
              className={`p-8 text-center space-y-4 ${
                correct ? "bg-green-50" : "bg-red-50"
              }`}
            >
              <div className="text-5xl">{correct ? "🎉" : "💀"}</div>
              <h2
                id="killer-guess-title"
                className={`text-xl font-bold ${
                  correct ? "text-green-700" : "text-red-700"
                }`}
              >
                {correct ? "✓ Found the killer!" : "✗ You have died."}
              </h2>
              <p
                className={`text-sm ${
                  correct ? "text-green-600" : "text-red-500"
                }`}
              >
                {correct
                  ? "Redirecting to lobby…"
                  : "The game continues without you."}
              </p>
            </div>
          )}
        </div>
      </div>
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
  const [showGuessModal, setShowGuessModal] = useState(false);

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
  const isMayor = data?.caller.role_name === "Mayor";

  // FAB visibility: alive, not tipped, not the killer
  const callerIsAlive =
    data?.caller !== undefined &&
    (data.caller.is_dead === 0 || data.caller.revived_at !== null);
  const showFab =
    callerIsAlive &&
    data?.caller.has_tipped === 0 &&
    data?.caller.role_name !== "Killer";

  // ── Handle wrong tip guess (caller died optimistically) ──────

  const handleWrongGuess = useCallback((callerUserId: number) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        caller: { ...prev.caller, is_dead: 1, revived_at: null },
        players: prev.players.map((p) =>
          p.user_id === callerUserId
            ? { ...p, is_dead: 1, revived_at: null }
            : p,
        ),
      };
    });
  }, []);

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
      {/* ── Vote countdown (hidden for Mayor) ───────────────── */}
      {data && !isMayor && (
        <VoteCountdown
          voteWindowStart={data.game.vote_window_start}
          voteWindowEnd={data.game.vote_window_end}
        />
      )}

      {/* ── Seer info banner ─────────────────────────────────── */}
      {canSeeKiller && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2 text-sm text-purple-700"
        >
          <span aria-hidden="true">👁️</span>
          <span>You know who the killer is. Keep it secret.</span>
        </div>
      )}

      {/* ── Mayor info banner ─────────────────────────────────── */}
      {isMayor && (
        <div
          role="status"
          className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-700"
        >
          <span aria-hidden="true">⚖️</span>
          <span>Everyone looks the same to you. Trust your instincts.</span>
        </div>
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
        <div className="player-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {data && data.players.length === 0 && (
        <p className="text-center text-gray-400 py-12">No players found</p>
      )}

      {data && data.players.length > 0 && (
        <div className="player-grid">
          {data.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isOwnCard={player.user_id === data.caller.user_id}
              isKiller={canSeeKiller && isKiller(player.user_id, data.killer_id ?? undefined)}
              canRevive={canRevive}
              viewerRole={data.caller.role_name}
              team1Name={data.game.team1_name}
              team2Name={data.game.team2_name}
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

      {/* ── Killer guess modal ───────────────────────────────── */}
      {showGuessModal && data && (
        <KillerGuessModal
          gameId={gameId}
          players={data.players}
          callerUserId={data.caller.user_id}
          onClose={() => setShowGuessModal(false)}
          onWrongGuess={handleWrongGuess}
        />
      )}

      {/* ── Killer guess FAB ─────────────────────────────────── */}
      {showFab && !showGuessModal && (
        <button
          type="button"
          onClick={() => setShowGuessModal(true)}
          className="fixed right-6 z-40 flex items-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-lg hover:bg-indigo-700 transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
          style={{ bottom: "calc(1.5rem + var(--safe-bottom))" }}
          aria-label="Guess the killer"
        >
          <span aria-hidden="true">🔍</span> Guess the killer!
        </button>
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
