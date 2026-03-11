"use client";

import { memo, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerCardPlayer {
  id: number; // game_players.id
  user_id: number;
  name: string;
  avatar_url: string | null;
  /** Present for most roles; omitted for Mayor callers — the server strips team data intentionally. */
  team?: "team1" | "team2" | null;
  is_dead: number;
  is_revived: number;
  revived_at: number | null;
  /** Present for most roles; omitted for Mayor callers — the server strips role_color intentionally. */
  role_color?: string;
}

export interface PlayerCardProps {
  player: PlayerCardPlayer;
  /** True when this card belongs to the currently logged-in user. */
  isOwnCard: boolean;
  /** True when the caller has `see_killer` and this player is the killer. */
  isKiller: boolean;
  /** True when the caller has the `revive_dead` (Healer) permission. */
  canRevive: boolean;
  /**
   * The role name of the viewing player (e.g. "Mayor", "Seer").
   * Used to apply role-specific rendering rules such as the Mayor's flat view.
   */
  viewerRole?: string | null;
  /** Human-readable label for team1 (used by the team badge). */
  team1Name?: string;
  /** Human-readable label for team2 (used by the team badge). */
  team2Name?: string;
  /** Callback when the logged-in user taps their own avatar. */
  onSelfTap?: () => void;
  /** Callback when the Healer taps the Revive button. */
  onRevive?: (gamePlayerId: number) => void;
  /**
   * When true, show the role-color border on each player card.
   * Only viewers with a special role (any permissions) should see these.
   * Seer: red border only on killer card; Medic: no role-color border.
   */
  showRoleBorder?: boolean;
  /**
   * Milliseconds to wait before applying the death animation (grayscale + overlay).
   * Defaults to 0 (immediate). Only applied on live `is_dead` transitions, not on mount.
   */
  deathAnimationDelayMs?: number;
}

// ── Team badge ────────────────────────────────────────────────────

function TeamBadge({
  team,
  team1Name,
  team2Name,
}: {
  team: "team1" | "team2" | null;
  team1Name: string;
  team2Name: string;
}) {
  if (!team) return null;

  const label = team === "team1" ? team1Name : team2Name;
  const colorClass =
    team === "team1"
      ? "bg-indigo-100 text-indigo-700"
      : "bg-rose-100 text-rose-700";

  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}
    >
      {label}
    </span>
  );
}

// ── PlayerCard ────────────────────────────────────────────────────

/**
 * Displays a single player in the game board grid.
 *
 * Visual states:
 * - Mayor view: flat grid — only avatar + name; no border color, no team badge, no labels.
 * - Dead:       grayscale filter + red ✕ overlay (non-Mayor callers).
 * - Undead:     (is_dead && revived_at) → grayscale, no ✕, green "Undead" label.
 * - Killer:     thin red border (visible to Seer only) + "Killer" label.
 * - Own card:   tapping the avatar opens the self-death modal.
 * - Healer:     "Revive" button below dead player's name.
 * - Default:    2px border in role color + team badge.
 */
export const PlayerCard = memo(function PlayerCard({
  player,
  isOwnCard,
  isKiller,
  canRevive,
  viewerRole,
  team1Name = "Team 1",
  team2Name = "Team 2",
  onSelfTap,
  onRevive,
  showRoleBorder = false,
  deathAnimationDelayMs = 0,
}: PlayerCardProps) {
  const isMayorView = viewerRole === "Mayor";

  const isDead = player.is_dead === 1;
  // Undead: revived but not re-dead (is_revived=1, is_dead=0)
  const isUndead = player.is_revived === 1 && !isDead;

  // ── Death animation: apply grayscale/overlay after delay on live transition ──
  // Track previous is_dead value to detect transitions (not initial mount).
  const prevIsDeadRef = useRef<number | null>(null);
  const [showDeadStyle, setShowDeadStyle] = useState(isDead);

  useEffect(() => {
    const prev = prevIsDeadRef.current;
    const current = player.is_dead;

    // First mount: set ref and apply dead style immediately (no animation).
    if (prev === null) {
      prevIsDeadRef.current = current;
      setShowDeadStyle(current === 1);
      return;
    }

    prevIsDeadRef.current = current;

    // Live transition to dead: delay the visual style change.
    if (prev !== 1 && current === 1) {
      const timer = setTimeout(() => {
        setShowDeadStyle(true);
      }, deathAnimationDelayMs);
      return () => clearTimeout(timer);
    }

    // Transition to alive (revive): remove dead style immediately.
    if (current !== 1) {
      setShowDeadStyle(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.is_dead, deathAnimationDelayMs]);

  // ── Avatar click handler (shared between Mayor and default) ─
  const avatarClickProps =
    isOwnCard && !isDead
      ? {
          onClick: onSelfTap,
          role: "button" as const,
          "aria-label": "Report death",
          tabIndex: 0,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") onSelfTap?.();
          },
        }
      : {};

  // ── Mayor view: flat equal grid ─────────────────────────────
  if (isMayorView) {
    return (
      <div className="relative flex flex-col items-center gap-2 rounded-2xl bg-white border border-gray-200 p-3 text-center shadow-sm">
        <div
          className={[
            "relative w-16 h-16 rounded-full overflow-hidden bg-indigo-100 shrink-0",
            isOwnCard ? "cursor-pointer ring-2 ring-offset-1 ring-indigo-400" : "",
          ]
            .join(" ")
            .trim()}
          {...avatarClickProps}
        >
          {player.avatar_url ? (
            <Image
              src={blobImageSrc(player.avatar_url)}
              alt={player.name}
              fill
              sizes="64px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-indigo-400 select-none">
              {player.name.charAt(0).toUpperCase()}
            </div>
          )}
        </div>

        <p className="text-sm font-semibold text-gray-800 leading-tight truncate w-full px-1">
          {player.name}
        </p>

        {/* ── Undead badge visible to ALL players (including Mayor) ── */}
        {isUndead && (
          <span className="text-xs font-semibold text-green-600">Undead</span>
        )}
      </div>
    );
  }

  // ── Border style (default view) ─────────────────────────────
  // Seer (see_killer): red border only on killer card.
  // All other callers (including Medic): plain gray border.
  const borderStyle = isKiller
    ? { border: "2px solid #c0392b" } // red border for killer (Seer view)
    : { border: "2px solid #e5e7eb" }; // plain gray-200

  // ── Card wrapper classes ────────────────────────────────────
  const cardClasses = [
    "relative flex flex-col items-center gap-2 rounded-2xl bg-white p-3 text-center shadow-sm",
    showDeadStyle ? "opacity-80" : "",
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
          showDeadStyle ? "grayscale" : "",
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
            src={blobImageSrc(player.avatar_url)}
            alt={player.name}
            fill
            sizes="64px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-indigo-400 select-none">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}

        {/* ── Red ✕ overlay (dead, not undead) ──────────────── */}
        {showDeadStyle && !isUndead && (
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

      {/* ── Team badge ────────────────────────────────────────── */}
      <TeamBadge
        team={player.team ?? null}
        team1Name={team1Name}
        team2Name={team2Name}
      />

      {/* ── Status labels ─────────────────────────────────────── */}
      {isUndead && (
        <span className="text-xs font-semibold text-green-600">Undead</span>
      )}
      {isKiller && (
        <span className="text-xs font-semibold text-red-600">Killer</span>
      )}

      {/* ── Revive button (Healer + dead player who was never revived) ── */}
      {canRevive && isDead && player.is_revived === 0 && (
        <button
          onClick={() => onRevive?.(player.id)}
          className="mt-1 rounded-lg bg-green-100 px-3 py-1 text-xs font-semibold text-green-700 hover:bg-green-200 transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-1"
        >
          Revive
        </button>
      )}
    </div>
  );
});
