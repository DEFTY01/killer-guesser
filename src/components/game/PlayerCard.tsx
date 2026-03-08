"use client";

import Image from "next/image";

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerCardPlayer {
  id: number; // game_players.id
  user_id: number;
  name: string;
  avatar_url: string | null;
  team: "team1" | "team2" | null;
  is_dead: number;
  revived_at: number | null;
  role_color: string;
}

export interface PlayerCardProps {
  player: PlayerCardPlayer;
  /** True when this card belongs to the currently logged-in user. */
  isOwnCard: boolean;
  /** True when the caller has `see_killer` and this player is the killer. */
  isKiller: boolean;
  /** True when the caller has the `revive_dead` (Healer) permission. */
  canRevive: boolean;
  /** Callback when the logged-in user taps their own avatar. */
  onSelfTap?: () => void;
  /** Callback when the Healer taps the Revive button. */
  onRevive?: (gamePlayerId: number) => void;
}

// ── PlayerCard ────────────────────────────────────────────────────

/**
 * Displays a single player in the game board grid.
 *
 * Visual states:
 * - Dead:      grayscale filter + red ✕ overlay
 * - Undead:    (is_dead && revived_at) → grayscale, no ✕, green "Undead" label
 * - Killer:    thin red border (visible to Seer only) + "Killer" label
 * - Own card:  tapping the avatar opens the self-death modal
 * - Healer:    "Revive" button below dead player's name
 *
 * Every card has a 2px border in the role's `color_hex`.
 */
export function PlayerCard({
  player,
  isOwnCard,
  isKiller,
  canRevive,
  onSelfTap,
  onRevive,
}: PlayerCardProps) {
  const isDead = player.is_dead === 1;
  const isUndead = isDead && player.revived_at != null;

  // ── Border style ────────────────────────────────────────────
  const borderStyle = isKiller
    ? { border: "2px solid #ef4444" } // red border for killer (Seer view)
    : { border: `2px solid ${player.role_color}` };

  // ── Card wrapper classes ────────────────────────────────────
  const cardClasses = [
    "relative flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center shadow-sm",
    isDead ? "opacity-80" : "",
  ]
    .join(" ")
    .trim();

  return (
    <div className={cardClasses} style={borderStyle}>
      {/* ── Avatar ────────────────────────────────────────────── */}
      <div
        className={[
          "relative w-16 h-16 rounded-full overflow-hidden bg-indigo-100 shrink-0",
          isOwnCard ? "cursor-pointer ring-2 ring-offset-1 ring-indigo-400" : "",
          isDead ? "grayscale" : "",
        ]
          .join(" ")
          .trim()}
        onClick={isOwnCard && !isDead ? onSelfTap : undefined}
        role={isOwnCard && !isDead ? "button" : undefined}
        aria-label={isOwnCard && !isDead ? "Report death" : undefined}
        tabIndex={isOwnCard && !isDead ? 0 : undefined}
        onKeyDown={
          isOwnCard && !isDead
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") onSelfTap?.();
              }
            : undefined
        }
      >
        {player.avatar_url ? (
          <Image
            src={player.avatar_url}
            alt={player.name}
            fill
            sizes="64px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-indigo-400 select-none">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* ── Red ✕ overlay (dead, not undead) ──────────────── */}
        {isDead && !isUndead && (
          <div
            className="absolute inset-0 flex items-center justify-center"
            aria-hidden="true"
          >
            {/* Horizontal bar of the X */}
            <span
              className="absolute block w-[80%] h-[3px] bg-red-500 rounded-full"
              style={{ transform: "rotate(45deg)" }}
            />
            <span
              className="absolute block w-[80%] h-[3px] bg-red-500 rounded-full"
              style={{ transform: "rotate(-45deg)" }}
            />
          </div>
        )}
      </div>

      {/* ── Name ────────────────────────────────────────────────── */}
      <p className="text-sm font-semibold text-gray-800 leading-tight truncate w-full px-1">
        {player.name}
      </p>

      {/* ── Status labels ─────────────────────────────────────── */}
      {isUndead && (
        <span className="text-xs font-semibold text-green-600">Undead</span>
      )}
      {isKiller && (
        <span className="text-xs font-semibold text-red-600">Killer</span>
      )}

      {/* ── Revive button (Healer + dead player) ─────────────── */}
      {canRevive && isDead && !isUndead && (
        <button
          onClick={() => onRevive?.(player.id)}
          className="mt-1 rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
        >
          Revive
        </button>
      )}
    </div>
  );
}
