"use client";

import { memo, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Heartbeat, Skull } from "@phosphor-icons/react";
import { blobImageSrc } from "@/lib/blob-image";

// ── Types ─────────────────────────────────────────────────────────

export interface PlayerCardPlayer {
  id: number; // game_players.id
  user_id: number;
  name: string;
  avatar_url: string | null;
  /** Present for most roles; omitted for Mayor callers - the server strips team data intentionally. */
  team?: "team1" | "team2" | null;
  is_dead: number;
  is_revived: number;
  revived_at: number | null;
  /** Present for most roles; omitted for Mayor callers - the server strips role_color intentionally. */
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
  /** Callback when the logged-in user taps their own "Report death" button. */
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

  return <span className="pill max-w-full truncate">{label}</span>;
}

// ── Avatar ────────────────────────────────────────────────────────

function Avatar({
  player,
  className = "",
}: {
  player: PlayerCardPlayer;
  className?: string;
}) {
  return (
    <div
      className={`relative size-16 shrink-0 overflow-hidden rounded-full bg-accent-soft ${className}`}
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
        <div className="flex h-full w-full select-none items-center justify-center text-2xl font-semibold text-accent">
          {player.name.charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
}

// ── Self-report button ────────────────────────────────────────────

function ReportDeathButton({ onClick }: { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="btn btn-danger-soft btn-sm mt-1 w-full"
    >
      <Skull className="size-4 shrink-0" aria-hidden="true" />
      Report death
    </button>
  );
}

// ── PlayerCard ────────────────────────────────────────────────────

/**
 * Displays a single player in the game board grid.
 *
 * Visual states:
 * - Mayor view: flat grid - only avatar + name; no border color, no team badge, no labels.
 * - Dead:       grayscale filter + X overlay + "Dead" label (non-Mayor callers).
 * - Undead:     (is_dead && revived_at) -> grayscale, no X, "Undead" label.
 * - Killer:     red border (visible to Seer only) + "Killer" label.
 * - Own card:   a "Report death" button opens the self-death modal (which confirms first).
 * - Healer:     "Revive" button below dead player's name.
 * - Default:    neutral border + team badge.
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
      // useState(isDead) already applied the initial style.
      prevIsDeadRef.current = current;
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
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowDeadStyle(false);
    }
  }, [player.is_dead, deathAnimationDelayMs]);

  const ownRing = isOwnCard
    ? "ring-2 ring-accent ring-offset-2 ring-offset-surface"
    : "";
  const showReport = isOwnCard && !isDead;

  // ── Mayor view: flat equal grid ─────────────────────────────
  if (isMayorView) {
    return (
      <div className="card relative flex flex-col items-center gap-2 p-3 text-center">
        <Avatar player={player} className={ownRing} />

        <p className="w-full truncate px-1 text-sm font-semibold leading-tight text-fg">
          {player.name}
        </p>
        {isOwnCard && <span className="sr-only">(you)</span>}

        {/* Undead badge visible to ALL players (including Mayor) */}
        {isUndead && (
          <span className="pill pill-accent">
            <Heartbeat className="size-3.5" aria-hidden="true" />
            Undead
          </span>
        )}

        {showReport && <ReportDeathButton onClick={onSelfTap} />}
      </div>
    );
  }

  // ── Card wrapper classes ────────────────────────────────────
  // Killer border (Seer view) stays inline: a fixed semantic red in both themes.
  const cardClasses = [
    "card relative flex flex-col items-center gap-2 border-2 p-3 text-center transition-opacity duration-500",
    isKiller ? "" : "border-line",
    showDeadStyle ? "opacity-80" : "",
  ]
    .join(" ")
    .trim();

  return (
    <div
      className={cardClasses}
      style={isKiller ? { border: "2px solid #c0392b" } : undefined}
    >
      {/* ── Avatar ────────────────────────────────────────────── */}
      <Avatar
        player={player}
        className={`transition-[filter] duration-500 ${ownRing} ${
          showDeadStyle ? "grayscale" : ""
        }`}
      />
      {isOwnCard && <span className="sr-only">(you)</span>}

      {/* ── X overlay (dead, not undead) ─────────────────────── */}
      {showDeadStyle && !isUndead && (
        <div
          className="pointer-events-none absolute left-1/2 top-3 size-16 -translate-x-1/2 animate-[fade_300ms_ease-out_both]"
          aria-hidden="true"
        >
          <span className="absolute left-[10%] top-1/2 block h-[3px] w-[80%] rotate-45 rounded-full bg-danger" />
          <span className="absolute left-[10%] top-1/2 block h-[3px] w-[80%] -rotate-45 rounded-full bg-danger" />
        </div>
      )}

      {/* ── Name ────────────────────────────────────────────────── */}
      <p className="w-full truncate px-1 text-sm font-semibold leading-tight text-fg">
        {player.name}
      </p>

      {/* ── Team badge ────────────────────────────────────────── */}
      <TeamBadge
        team={player.team ?? null}
        team1Name={team1Name}
        team2Name={team2Name}
      />

      {/* ── Status labels (text, never color alone) ───────────── */}
      {showDeadStyle && !isUndead && (
        <span className="pill pill-danger">
          <Skull className="size-3.5" aria-hidden="true" />
          Dead
        </span>
      )}
      {isUndead && (
        <span className="pill pill-accent">
          <Heartbeat className="size-3.5" aria-hidden="true" />
          Undead
        </span>
      )}
      {isKiller && <span className="pill pill-danger">Killer</span>}

      {/* ── Self-report (own card, alive) ─────────────────────── */}
      {showReport && <ReportDeathButton onClick={onSelfTap} />}

      {/* ── Revive button (Healer + dead player who was never revived) ── */}
      {canRevive && isDead && player.is_revived === 0 && (
        <button
          type="button"
          onClick={() => onRevive?.(player.id)}
          className="btn btn-secondary btn-sm mt-1 w-full"
        >
          <Heartbeat className="size-4 shrink-0" aria-hidden="true" />
          Revive
        </button>
      )}
    </div>
  );
});
