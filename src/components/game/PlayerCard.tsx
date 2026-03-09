"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { DEFAULT_ROLE_COLOR } from "@/lib/role-constants";

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
   */
  showRoleBorder?: boolean;
  /**
   * When true the card plays a flip animation to reveal the player's role.
   * Used once per session when the player first enters the game board.
   */
  isRoleRevealing?: boolean;
  revealRoleName?: string | null;
  revealRoleColor?: string | null;
  revealRoleDescription?: string | null;
  revealTeamName?: string | null;
  onRoleRevealDone?: () => void;
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
export function PlayerCard({
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
  isRoleRevealing = false,
  revealRoleName,
  revealRoleColor,
  revealRoleDescription,
  revealTeamName,
  onRoleRevealDone,
}: PlayerCardProps) {
  // Flip state for role reveal
  const [flipped, setFlipped] = useState(false);
  useEffect(() => {
    if (!isRoleRevealing) return;
    setFlipped(false);
    const t = setTimeout(() => setFlipped(true), 600);
    return () => clearTimeout(t);
  }, [isRoleRevealing]);

  const isMayorView = viewerRole === "Mayor";

  // ── Role reveal flip card (own card, first visit) ────────────
  if (isRoleRevealing) {
    const bg = revealRoleColor ?? DEFAULT_ROLE_COLOR;
    return (
      <div style={{ perspective: "1200px" }}>
        <div
          style={{
            position: "relative",
            width: "100%",
            minHeight: 148,
            transformStyle: "preserve-3d",
            transition: "transform 0.65s cubic-bezier(0.4,0,0.2,1)",
            transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
          }}
        >
          {/* Front face — mystery back */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-2xl shadow-md"
            style={{
              backfaceVisibility: "hidden",
              background: "linear-gradient(135deg,#1e3a5f 0%,#0f2040 100%)",
            }}
          >
            <div className="text-4xl select-none">🃏</div>
            <p className="text-white/70 text-xs font-medium">Your role…</p>
          </div>

          {/* Back face — role info */}
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 shadow-md"
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              background: `linear-gradient(135deg,${bg}ee 0%,${bg}99 100%)`,
            }}
          >
            <p className="text-white/80 text-[9px] font-bold uppercase tracking-widest">
              Your Role
            </p>
            <p className="text-white text-sm font-bold text-center leading-tight">
              {revealRoleName ?? "Unknown"}
            </p>
            {revealTeamName && (
              <span className="text-white/90 text-[10px] font-semibold bg-white/20 px-2 py-0.5 rounded-full">
                {revealTeamName}
              </span>
            )}
            {revealRoleDescription && (
              <p className="text-white/75 text-[9px] text-center leading-snug">
                {revealRoleDescription}
              </p>
            )}
            {flipped && (
              <button
                type="button"
                onClick={onRoleRevealDone}
                className="mt-1 rounded-lg bg-white/25 px-3 py-1 text-[10px] font-bold text-white hover:bg-white/40 transition-colors focus:outline-none"
              >
                Got it ✓
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const isDead = player.is_dead === 1;
  // Undead: revived but not re-dead (is_revived=1, is_dead=0)
  const isUndead = player.is_revived === 1 && !isDead;

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
              src={player.avatar_url}
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
  // Only viewers with a special role see colored borders; others get a plain gray border.
  const borderStyle = isKiller
    ? { border: "2px solid #c0392b" } // red border for killer (Seer view)
    : showRoleBorder
      ? { border: `2px solid ${player.role_color ?? DEFAULT_ROLE_COLOR}` }
      : { border: "2px solid #e5e7eb" }; // plain gray-200 for regular viewers

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
            unoptimized
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
}
