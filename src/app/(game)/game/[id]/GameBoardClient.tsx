"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle,
  Check,
  Eye,
  EyeSlash,
  MagnifyingGlass,
  Scales,
  Skull,
  Trophy,
  Warning,
  X,
} from "@phosphor-icons/react";
import { VoteCountdown } from "@/components/game/VoteCountdown";
import { PlayerCard, type PlayerCardPlayer } from "@/components/game/PlayerCard";
import { RoleRevealModal } from "@/components/game/RoleRevealModal";
import { readableOn, roleColorOrDefault } from "@/components/game/roleColor";
import { Modal } from "@/components/ui/Modal";
import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";
import type { RolePermission } from "@/lib/role-constants";
import { isKiller } from "@/lib/roleUtils";
import { useAbly } from "@/hooks/useAbly";
import { ABLY_CHANNELS, ABLY_EVENTS } from "@/lib/ably";
import { activePollers, cleanupPoller } from "@/lib/pollers";

// ── Types ─────────────────────────────────────────────────────────

interface GameInfo {
  id: string;
  name: string;
  team1_name: string;
  team2_name: string;
  vote_window_start: string | null;
  vote_window_end: string | null;
  current_day: number;
  game_timezone: string;
}

interface SettingsInfo {
  murder_item_url: string | null;
  murder_item_name: string | null;
  death_animation_delay_ms: number | null;
}

interface CallerInfo {
  game_player_id: number;
  user_id: number;
  permissions: RolePermission[];
  role_name: string | null;
  role_color: string | null;
  role_description: string | null;
  team: "team1" | "team2" | null;
  is_dead: number;
  is_revived: number;
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
  tips?: Array<{
    tipper_id: number;
    tipper_name: string;
    suspect_id: number | null;
    suspect_name: string | null;
    tipper_is_dead: number;
  }>;
}

interface VoteLogEntry {
  voter_id: number;
  voter_name: string;
  target_id: number;
  target_name: string;
}

// ── Helpers ────────────────────────────────────────────────────────

/**
 * Converts a HH:MM string stored in the game's timezone to a display string
 * in the browser's local timezone.
 *
 * e.g. "17:45" in Europe/Budapest (UTC+1) -> "17:45" for Budapest users,
 *      or "16:45" for UTC users.
 */
function gameHhmmToLocalString(hhmm: string, gameTimezone: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return hhmm;

  // Get today's date in the game timezone.
  const now = new Date();
  const gameDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: gameTimezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now); // e.g. "2026-03-11"

  const [yearStr, monthStr, dayStr] = gameDateStr.split("-");
  const candidateUtcMs = Date.UTC(
    parseInt(yearStr ?? "2000"),
    parseInt(monthStr ?? "1") - 1,
    parseInt(dayStr ?? "1"),
    h,
    m,
    0,
    0,
  );

  // Measure what time the candidate shows in the game timezone,
  // then subtract the offset to get the true UTC instant.
  const candidateDate = new Date(candidateUtcMs);
  const gameParts = new Intl.DateTimeFormat("en-US", {
    timeZone: gameTimezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(candidateDate);
  const dispH =
    parseInt(gameParts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const dispM = parseInt(
    gameParts.find((p) => p.type === "minute")?.value ?? "0",
  );
  const offsetMs = (dispH * 60 + dispM - h * 60 - m) * 60 * 1000;

  const actualDate = new Date(candidateUtcMs - offsetMs);
  return actualDate.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function isVoteWindowActive(
  start: string | null,
  end: string | null,
  timezone: string,
): boolean {
  if (!start || !end) return false;
  // Check current time in the game's timezone (not UTC).
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = parseInt(parts.find((p) => p.type === "hour")?.value ?? "0") % 24;
  const m = parseInt(parts.find((p) => p.type === "minute")?.value ?? "0");
  const currentMin = h * 60 + m;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) return false;
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  // Handle overnight windows (e.g. 22:00-02:00).
  if (endMin <= startMin) {
    return currentMin >= startMin || currentMin < endMin;
  }
  return currentMin >= startMin && currentMin < endMin;
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
    <Modal
      className="modal-full"
      aria-label={name ?? "Murder item fullscreen view"}
      onClose={onClose}
      onClick={onClose}
    >
      <div className="relative h-full w-full">
        <Image
          src={blobImageSrc(url)}
          alt={name ?? "Murder item"}
          fill
          sizes="100vw"
          className="object-contain p-6"
          unoptimized
        />
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="btn btn-secondary absolute right-4 top-[calc(1rem+var(--safe-top))] size-11 px-0"
      >
        <X className="size-5" aria-hidden="true" />
      </button>
    </Modal>
  );
}

// ── Murder item card ──────────────────────────────────────────────

function MurderItemCard({ url, name }: { url: string | null; name: string | null }) {
  const [modalOpen, setModalOpen] = useState(false);

  if (!url && !name) return null;

  return (
    <>
      <div className="card mx-auto max-w-xs overflow-hidden">
        <p className="px-4 pt-3 text-center text-sm font-medium text-muted">
          The killer&apos;s weapon:
        </p>
        {url && (
          <button
            type="button"
            aria-label="View murder weapon fullscreen"
            onClick={() => setModalOpen(true)}
            className="relative block aspect-square w-full cursor-zoom-in bg-elevated focus-visible:outline-offset-[-2px]"
          >
            <Image
              src={blobImageSrc(url)}
              alt={name ?? "Murder item"}
              fill
              sizes="(max-width: 320px) 100vw, 320px"
              className="object-contain p-4"
              unoptimized
            />
          </button>
        )}
        {name && (
          <p className="px-4 py-3 text-center text-sm font-semibold text-fg">
            {name}
          </p>
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
    <Modal
      className="modal"
      aria-labelledby="death-modal-title"
      onClose={submitting ? undefined : onClose}
    >
      <div className="p-6 pb-[calc(1.5rem+var(--safe-bottom))]">
        {step === "confirm" ? (
          <>
            <h2
              id="death-modal-title"
              className="mb-5 text-center text-lg font-semibold text-fg"
            >
              Did you die?
            </h2>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setStep("form")}
                className="btn btn-danger flex-1"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn btn-secondary flex-1"
              >
                No
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h2
              id="death-modal-title"
              className="mb-4 text-center text-lg font-semibold text-fg"
            >
              Where did it happen?
            </h2>

            {error && (
              <p role="alert" className="callout callout-danger mb-3">
                {error}
              </p>
            )}

            <label className="mb-3 block">
              <span className="mb-1.5 block text-sm font-medium text-fg">
                Location
              </span>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. The kitchen"
                maxLength={200}
                required
                className="field"
              />
            </label>

            <label className="mb-5 block">
              <span className="mb-1.5 block text-sm font-medium text-fg">
                Time of day
              </span>
              <select
                value={timeOfDay}
                onChange={(e) =>
                  setTimeOfDay(
                    e.target.value as "morning" | "afternoon" | "evening",
                  )
                }
                className="field"
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
                className="btn btn-danger flex-1"
              >
                {submitting ? "Submitting…" : "Confirm"}
              </button>
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </Modal>
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

function GuessAvatar({
  player,
  size,
}: {
  player: GuessPlayer;
  size: 48 | 80;
}) {
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full bg-accent-soft ${
        size === 48 ? "size-12" : "size-20"
      }`}
    >
      {player.avatar_url ? (
        <Image
          src={blobImageSrc(player.avatar_url)}
          alt={player.name}
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized
        />
      ) : (
        <span
          className={`flex h-full w-full items-center justify-center font-semibold text-accent ${
            size === 48 ? "text-base" : "text-2xl"
          }`}
        >
          {player.name.charAt(0).toUpperCase()}
        </span>
      )}
    </div>
  );
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
    <Modal
      className="modal"
      aria-labelledby="killer-guess-title"
      onClose={screen === 3 || submitting ? undefined : onClose}
    >
      <div className="pb-[var(--safe-bottom)]">
        {/* Screen 1: Suspect grid */}
        {screen === 1 && (
          <div className="space-y-4 p-6">
            <h2
              id="killer-guess-title"
              className="flex items-center justify-center gap-2 text-lg font-semibold text-fg"
            >
              <MagnifyingGlass className="size-5 text-accent" aria-hidden="true" />
              Who is the killer?
            </h2>
            {apiError && (
              <p role="alert" className="callout callout-danger">
                {apiError}
              </p>
            )}
            <div className="player-grid player-grid-vote max-h-72 overflow-y-auto">
              {alivePlayers.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSuspect(p);
                    setScreen(2);
                  }}
                  className="flex min-h-11 flex-col items-center gap-1.5 rounded-control border border-line bg-elevated p-2 transition-[border-color,transform] duration-150 active:scale-[0.98]"
                >
                  <GuessAvatar player={p} size={48} />
                  <span className="max-w-full truncate text-xs font-semibold text-fg">
                    {p.name}
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={onClose} className="btn btn-secondary w-full">
              Cancel
            </button>
          </div>
        )}

        {/* Screen 2: Confirm accusation */}
        {screen === 2 && suspect && (
          <div className="space-y-5 p-6 text-center">
            <h2 id="killer-guess-title" className="text-lg font-semibold text-fg">
              Accuse {suspect.name}?
            </h2>
            <div className="flex justify-center">
              <GuessAvatar player={suspect} size={80} />
            </div>
            <p className="callout callout-danger justify-center font-semibold">
              <Warning className="size-5 shrink-0" aria-hidden="true" />
              If you&apos;re wrong, you die!
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setScreen(1)}
                disabled={submitting}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleAccuse}
                disabled={submitting}
                className="btn btn-danger flex-1"
              >
                {submitting ? "Accusing…" : "Accuse them"}
              </button>
            </div>
          </div>
        )}

        {/* Screen 3: Result */}
        {screen === 3 && correct !== null && (
          <div role="status" aria-live="polite" className="space-y-4 p-8 text-center">
            {correct ? (
              <CheckCircle className="mx-auto size-14 text-success" aria-hidden="true" />
            ) : (
              <Skull className="mx-auto size-14 text-danger" aria-hidden="true" />
            )}
            <h2
              id="killer-guess-title"
              className={`text-xl font-semibold ${correct ? "text-success" : "text-danger"}`}
            >
              {correct ? "Found the killer!" : "You have died."}
            </h2>
            <p className="text-sm text-muted">
              {correct
                ? "Redirecting to lobby…"
                : "The game continues without you."}
            </p>
            {correct ? (
              <Link href="/lobby" className="btn btn-primary w-full">
                Back to lobby
              </Link>
            ) : (
              <button type="button" onClick={onClose} className="btn btn-secondary w-full">
                Close
              </button>
            )}
          </div>
        )}
      </div>
    </Modal>
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
  const [showRoleReveal, setShowRoleReveal] = useState(false);
  const [roleCardOpen, setRoleCardOpen] = useState(false);
  const [liveVotes, setLiveVotes] = useState<VoteLogEntry[]>([]);
  const [tips, setTips] = useState<BoardData["tips"]>([]);

  // ── Load board data ─────────────────────────────────────────

  const fetchBoard = useCallback(() => {
    fetch(`/api/game/${gameId}/board`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load board");
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          const boardData = json.data as BoardData;
          setData(boardData);
          setError(null);
          if (boardData.votes) {
            const playerMap = new Map(
              boardData.players.map((p) => [p.user_id, p.name]),
            );
            setLiveVotes(
              boardData.votes.map((v) => ({
                voter_id: v.voter_id,
                voter_name: playerMap.get(v.voter_id) ?? "Unknown",
                target_id: v.target_id,
                target_name: playerMap.get(v.target_id) ?? "Unknown",
              })),
            );
          }
          if (boardData.tips) {
            setTips(boardData.tips);
          }
        } else {
          setError((json.error as string) ?? "Unknown error");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, [gameId]);

  useEffect(() => {
    fetchBoard();
  }, [fetchBoard]);

  // Phones sleep and drop realtime messages; resync when the tab is visible
  // or the network returns so the board never stays stale.
  useEffect(() => {
    const resync = () => {
      if (document.visibilityState === "visible") fetchBoard();
    };
    document.addEventListener("visibilitychange", resync);
    window.addEventListener("online", resync);
    return () => {
      document.removeEventListener("visibilitychange", resync);
      window.removeEventListener("online", resync);
    };
  }, [fetchBoard]);

  // ── Show role reveal on first load (once per session) ───────
  useEffect(() => {
    if (!data) return;
    const key = `role_reveal_shown_${gameId}`;
    if (!sessionStorage.getItem(key)) {
      // sessionStorage is only readable after mount, so state must be set here.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowRoleReveal(true);
    }
  }, [data, gameId]);

  const handleRoleRevealClose = useCallback(() => {
    sessionStorage.setItem(`role_reveal_shown_${gameId}`, "1");
    setShowRoleReveal(false);
  }, [gameId]);

  // ── Track vote window ───────────────────────────────────────

  useEffect(() => {
    // Stop the interval immediately when the game has ended.
    if (!data || gameEnded !== false) {
      cleanupPoller(gameId);
      return;
    }
    const { vote_window_start, vote_window_end, game_timezone } = data.game;
    function checkWindow() {
      setVoteActive(isVoteWindowActive(vote_window_start, vote_window_end, game_timezone));
    }
    checkWindow();
    const id = setInterval(checkWindow, 5000);
    activePollers.set(gameId, id);
    return () => {
      clearInterval(id);
      activePollers.delete(gameId);
    };
  }, [data, gameEnded, gameId]);

  // ── Optimistic death update ─────────────────────────────────

  const handleDeathConfirmed = useCallback(() => {
    setShowDeathModal(false);
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        players: prev.players.map((p) =>
          p.user_id === prev.caller.user_id
            ? { ...p, is_dead: 1 }
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
                ? { ...p, is_dead: 0, is_revived: 1, revived_at: Math.floor(Date.now() / 1000) }
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

  const canRevive =
    data?.caller.is_dead === 0 &&
    (data?.caller.permissions.includes("revive_dead") ?? false);
  const canSeeKiller = data?.caller.permissions.includes("see_killer") ?? false;
  const canSeeVotes = data?.caller.permissions.includes("see_votes") ?? false;
  const isMayor = data?.caller.role_name === "Mayor";

  // FAB visibility: alive (includes undead since is_dead=0), not tipped, not the killer, not Undead
  const callerIsAlive =
    data?.caller !== undefined &&
    data.caller.is_dead === 0;
  const showFab =
    callerIsAlive &&
    data?.caller.is_revived === 0 &&
    data?.caller.has_tipped === 0 &&
    data?.caller.role_name !== "Killer";

  // ── Handle wrong tip guess (caller died optimistically) ──────

  const handleWrongGuess = useCallback((callerUserId: number) => {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        caller: { ...prev.caller, is_dead: 1 },
        players: prev.players.map((p) =>
          p.user_id === callerUserId
            ? { ...p, is_dead: 1 }
            : p,
        ),
      };
    });
  }, []);

  const handleSelfTap = useCallback(() => setShowDeathModal(true), []);

  const memoizedPlayers = useMemo(() => data?.players ?? [], [data?.players]);

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
              ? { ...p, is_dead: 1 }
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
      const { game_player_id, revived_at, is_revived } = msg.data as {
        player_id: number;
        game_player_id: number;
        revived_at: number;
        is_revived: number;
      };
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: prev.players.map((p) =>
            p.id === game_player_id
              ? { ...p, is_dead: 0, is_revived: is_revived ?? 1, revived_at }
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
        cleanupPoller(gameId);
        setGameEnded(winner_team ?? null);
        setTimeout(() => {
          router.push("/");
        }, 6000);
      },
      [router, gameId],
    ),
  );

  // ── Ably: VOTE_CAST (see_votes permission) ──────────────────

  useAbly(
    ABLY_CHANNELS.vote(gameId, data?.game.current_day ?? 1),
    ABLY_EVENTS.vote_cast,
    useCallback((msg) => {
      const { voter_id, voter_name, target_id, target_name } = msg.data as {
        voter_id: number;
        voter_name: string;
        target_id: number;
        target_name: string;
      };
      setLiveVotes((prev) => {
        const idx = prev.findIndex((v) => v.voter_id === voter_id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { voter_id, voter_name, target_id, target_name };
          return updated;
        }
        return [...prev, { voter_id, voter_name, target_id, target_name }];
      });
    }, []),
  );

  // ── Render ──────────────────────────────────────────────────

  // canVote: alive and does not have see_killer privilege
  const canVote = callerIsAlive && !canSeeKiller;

  const roleBand = roleColorOrDefault(data?.caller.role_color);

  return (
    <div
      className={`mx-auto w-full max-w-lg space-y-6 px-4 py-6${
        data ? " pb-[calc(8rem+var(--safe-bottom))]" : ""
      }`}
    >
      {/* ── Vote countdown (hidden for Mayor) ───────────────── */}
      {data && !isMayor && (
        <VoteCountdown
          voteWindowStart={data.game.vote_window_start}
          voteWindowEnd={data.game.vote_window_end}
        />
      )}

      {/* ── Seer info banner ─────────────────────────────────── */}
      {canSeeKiller && (
        <div role="status" className="callout callout-accent">
          <Eye className="size-5 shrink-0 text-accent" aria-hidden="true" />
          <span>You know who the killer is. Keep it secret.</span>
        </div>
      )}

      {/* ── Mayor info banner ─────────────────────────────────── */}
      {isMayor && (
        <div role="status" className="callout callout-accent">
          <Scales className="size-5 shrink-0 text-accent" aria-hidden="true" />
          <span>Everyone looks the same to you. Trust your instincts.</span>
        </div>
      )}

      {/* ── Game title ───────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="h-8 w-48" />
      ) : (
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
          {data?.game.name ?? "Game"}
        </h1>
      )}

      {/* ── Error state ─────────────────────────────────────── */}
      {error && (
        <div role="alert" className="callout callout-danger items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              fetchBoard();
            }}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Retry
          </button>
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
        <div className="player-grid player-grid-board">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {data && memoizedPlayers.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted">No players found</p>
          <button type="button" onClick={fetchBoard} className="btn btn-secondary">
            Refresh
          </button>
        </div>
      )}

      {data && memoizedPlayers.length > 0 && (
        <div className="player-grid player-grid-board">
          {memoizedPlayers.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              isOwnCard={player.user_id === data.caller.user_id}
              isKiller={canSeeKiller && isKiller(player.user_id, data.killer_id ?? undefined)}
              canRevive={canRevive}
              viewerRole={data.caller.role_name}
              showRoleBorder={false}
              deathAnimationDelayMs={data.settings.death_animation_delay_ms ?? 2000}
              team1Name={data.game.team1_name}
              team2Name={data.game.team2_name}
              onSelfTap={handleSelfTap}
              onRevive={handleRevive}
            />
          ))}
        </div>
      )}

      {/* ── "Your Role" collapsible section ─────────────────── */}
      {data && data.caller.role_name && (
        <div>
          <button
            type="button"
            onClick={() => setRoleCardOpen((o) => !o)}
            className="btn btn-ghost -ml-3"
            aria-expanded={roleCardOpen}
          >
            {roleCardOpen ? (
              <EyeSlash className="size-5" aria-hidden="true" />
            ) : (
              <Eye className="size-5" aria-hidden="true" />
            )}
            {roleCardOpen ? "Hide your role" : "Click to see your role"}
          </button>
          {roleCardOpen && (
            <div className="card mt-2 overflow-hidden animate-[fadeIn_220ms_var(--ease-out)_both]">
              <div
                className="px-4 py-4 text-center"
                style={{ backgroundColor: roleBand, color: readableOn(roleBand) }}
              >
                <p className="text-xs font-semibold">Your Role</p>
                <p className="font-display text-xl font-bold">{data.caller.role_name}</p>
              </div>
              <div className="space-y-2 p-4 text-center">
                {data.caller.team && (
                  <p className="text-sm font-medium text-fg">
                    Team:{" "}
                    {data.caller.team === "team1"
                      ? data.game.team1_name
                      : data.game.team2_name}
                  </p>
                )}
                {data.caller.role_description && (
                  <p className="text-sm leading-relaxed text-muted">
                    {data.caller.role_description}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Spy: Today's Votes ───────────────────────────────── */}
      {data && canSeeVotes && (
        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <Eye className="size-5 text-accent" aria-hidden="true" /> Votes Today
          </h2>
          {liveVotes.length === 0 ? (
            <p className="text-sm text-muted">No votes cast yet today.</p>
          ) : (
            <ul className="space-y-2" role="list">
              {liveVotes.map((entry) => {
                const voterPlayer = data.players.find(
                  (p) => p.user_id === entry.voter_id,
                );
                const isDead = voterPlayer?.is_dead === 1;
                return (
                  <li
                    key={entry.voter_id}
                    className="flex flex-wrap items-center gap-1.5 text-sm"
                  >
                    <span
                      className={`font-semibold ${isDead ? "text-muted line-through" : "text-fg"}`}
                    >
                      {entry.voter_name}
                    </span>
                    {isDead && (
                      <>
                        <Skull className="size-4 text-danger" aria-hidden="true" />
                        <span className="sr-only">(eliminated)</span>
                      </>
                    )}
                    <span className="text-muted">accused</span>
                    <span className="font-semibold text-fg">
                      {entry.target_name}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── Spy: Killer Guesses ──────────────────────────── */}
      {data && canSeeVotes && (
        <section className="card space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
            <MagnifyingGlass className="size-5 text-accent" aria-hidden="true" /> Killer Guesses
          </h2>
          {!tips || tips.length === 0 ? (
            <p className="text-sm text-muted">No killer guesses made yet.</p>
          ) : (
            <ul className="space-y-2" role="list">
              {tips.map((entry) => {
                const isDead = entry.tipper_is_dead === 1;
                return (
                  <li
                    key={entry.tipper_id}
                    className="flex flex-wrap items-center gap-1.5 text-sm"
                  >
                    <span
                      className={`font-semibold ${isDead ? "text-muted line-through" : "text-fg"}`}
                    >
                      {entry.tipper_name}
                    </span>
                    {isDead && (
                      <>
                        <Skull className="size-4 text-danger" aria-hidden="true" />
                        <span className="sr-only">(eliminated)</span>
                      </>
                    )}
                    <span className="text-muted">accused</span>
                    <span className="font-semibold text-fg">
                      {entry.suspect_name ?? "???"}
                    </span>
                    <span className="text-xs text-muted">as the killer</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {/* ── "I was eliminated" button ────────────────────────── */}
      {data && callerIsAlive && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowDeathModal(true)}
            className="btn btn-danger-soft"
          >
            <Skull className="size-5" aria-hidden="true" /> I was eliminated
          </button>
        </div>
      )}

      {/* ── Role reveal modal (full-screen, shown once on first load) */}
      {showRoleReveal && data && (
        <RoleRevealModal
          roleName={data.caller.role_name}
          roleColor={data.caller.role_color}
          roleDescription={data.caller.role_description}
          teamName={
            data.caller.team
              ? data.caller.team === "team1"
                ? data.game.team1_name
                : data.game.team2_name
              : null
          }
          onClose={handleRoleRevealClose}
        />
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
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+var(--safe-bottom))] z-40">
          <div className="mx-auto flex max-w-lg justify-end px-4">
            <button
              type="button"
              onClick={() => setShowGuessModal(true)}
              className="btn btn-secondary pointer-events-auto bg-surface shadow-lg"
              aria-label="Guess the killer"
            >
              <MagnifyingGlass className="size-5 text-accent" aria-hidden="true" /> Guess the killer!
            </button>
          </div>
        </div>
      )}

      {/* ── Vote sticky bottom bar ────────────────────────────── */}
      {data && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 pb-[var(--safe-bottom)] pl-[var(--safe-left)] pr-[var(--safe-right)] backdrop-blur-md">
          <div className="mx-auto flex max-w-lg items-center gap-3 px-4 py-3">
            <div
              role="status"
              aria-live="polite"
              className="flex min-w-0 flex-1 items-center gap-2.5"
            >
              {/* Single semantic live dot: only while the vote window is open */}
              {voteActive && (
                <span
                  className="size-2.5 shrink-0 animate-pulse rounded-full bg-success"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${voteActive ? "text-success" : "text-fg"}`}>
                  {voteActive
                    ? (canVote ? "Vote window open" : "Voting in progress")
                    : "Daily Vote"}
                </p>
                <p className="truncate text-sm text-muted">
                  {voteActive
                    ? `Day ${data.game.current_day}${data.game.vote_window_end ? `, closes ${gameHhmmToLocalString(data.game.vote_window_end, data.game.game_timezone)}` : ""}`
                    : data.game.vote_window_start
                      ? `Opens at ${gameHhmmToLocalString(data.game.vote_window_start, data.game.game_timezone)}`
                      : `Day ${data.game.current_day}`}
                </p>
              </div>
            </div>
            {/* The link ALWAYS navigates to the vote page. The vote page
                itself handles the "window closed" state with a clear message. */}
            <Link
              href={`/game/${gameId}/vote/${data.game.current_day}`}
              className={`btn shrink-0 ${
                voteActive && canVote ? "btn-primary" : "btn-secondary"
              }`}
            >
              {voteActive && canVote ? (
                <Check className="size-5" aria-hidden="true" />
              ) : voteActive ? (
                <Eye className="size-5" aria-hidden="true" />
              ) : null}
              {voteActive ? (canVote ? "Vote" : "Watch") : "Go to vote"}
            </Link>
          </div>
        </div>
      )}

      {/* ── Game-ended modal ─────────────────────────────────── */}
      {gameEnded !== false && (
        <Modal
          className="modal"
          aria-labelledby="game-ended-title"
          dismissible={false}
        >
          <div
            role="status"
            aria-live="polite"
            className="space-y-4 p-8 pb-[calc(2rem+var(--safe-bottom))] text-center"
          >
            <Trophy className="mx-auto size-14 text-accent" aria-hidden="true" />
            <h2 id="game-ended-title" className="text-xl font-semibold text-fg">
              Game Over!
            </h2>
            {gameEnded ? (
              <p className="text-muted">
                <span className="font-semibold text-fg">{gameEnded}</span>{" "}
                wins!
              </p>
            ) : (
              <p className="text-muted">The game has ended.</p>
            )}
            <p className="text-sm text-muted">
              Redirecting to home in a moment…
            </p>
            <Link href="/lobby" className="btn btn-primary w-full">
              Back to lobby
            </Link>
          </div>
        </Modal>
      )}
    </div>
  );
}
