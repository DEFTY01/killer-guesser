"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react";
import { Skeleton, SkeletonCard } from "@/components/ui/Skeleton";

// ── Types ─────────────────────────────────────────────────────────

interface Participant {
  id: number;
  name: string;
  avatar_url: string | null;
  team: "team1" | "team2" | null;
}

interface GameInfo {
  name: string;
  team1_name: string;
  team2_name: string;
}

interface ParticipantsData {
  game: GameInfo;
  players: Participant[];
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
  const label = !team ? "Unassigned" : team === "team1" ? team1Name : team2Name;
  return <span className="pill max-w-full truncate">{label}</span>;
}

// ── Player card ───────────────────────────────────────────────────

function PlayerCard({
  player,
  team1Name,
  team2Name,
}: {
  player: Participant;
  team1Name: string;
  team2Name: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-2 p-3 text-center">
      {/* Avatar */}
      <div className="relative size-16 shrink-0 overflow-hidden rounded-full bg-accent-soft">
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
          <div className="flex h-full w-full select-none items-center justify-center text-2xl font-semibold text-accent">
            {player.name.charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Name */}
      <p className="w-full truncate px-1 text-sm font-semibold leading-tight text-fg">
        {player.name}
      </p>

      {/* Team badge */}
      <TeamBadge
        team={player.team}
        team1Name={team1Name}
        team2Name={team2Name}
      />
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────

export default function ParticipantsPage() {
  const [data, setData] = useState<ParticipantsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/game/participants")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load participants");
        return res.json();
      })
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error ?? "Unknown error");
        }
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const isLoading = data === null && error === null;

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      {/* ── Back button ───────────────────────────────────────────── */}
      <Link href="/lobby" className="btn btn-ghost -ml-3 mb-3">
        <ArrowLeft className="size-5" aria-hidden="true" />
        Back
      </Link>

      {/* ── Header ────────────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="mb-1 h-8 w-48" />
      ) : (
        <h1 className="text-2xl font-semibold leading-tight tracking-tight text-fg">
          {data?.game.name ?? "Participants"}
        </h1>
      )}

      {/* ── Player count ──────────────────────────────────────────── */}
      {isLoading ? (
        <Skeleton className="mb-6 mt-2 h-4 w-28" />
      ) : (
        <p className="mb-6 mt-1 text-sm text-muted">
          {data ? `${data.players.length} player${data.players.length !== 1 ? "s" : ""}` : ""}
        </p>
      )}

      {/* ── Error state ───────────────────────────────────────────── */}
      {error && (
        <div role="alert" className="callout callout-danger items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => {
              setError(null);
              load();
            }}
            className="btn btn-secondary btn-sm shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Avatar grid ───────────────────────────────────────────── */}
      {isLoading && (
        <div className="player-grid" aria-hidden="true">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      )}

      {data && data.players.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="text-muted">No players yet - check back soon!</p>
          <button type="button" onClick={load} className="btn btn-secondary">
            Refresh
          </button>
        </div>
      )}

      {data && data.players.length > 0 && (
        <div className="player-grid">
          {data.players.map((player) => (
            <PlayerCard
              key={player.id}
              player={player}
              team1Name={data.game.team1_name}
              team2Name={data.game.team2_name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
