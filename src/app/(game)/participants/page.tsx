"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

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
  if (!team) {
    return (
      <span className="inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
        Unassigned
      </span>
    );
  }

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
    <div className="flex flex-col items-center gap-2 rounded-2xl bg-white border border-gray-100 shadow-sm p-3 text-center">
      {/* Avatar */}
      <div className="relative w-16 h-16 rounded-full overflow-hidden bg-indigo-100 shrink-0">
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
      </div>

      {/* Name */}
      <p className="text-sm font-semibold text-gray-800 leading-tight truncate w-full px-1">
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

// ── Main page ─────────────────────────────────────────────────────

export default function ParticipantsPage() {
  const [data, setData] = useState<ParticipantsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
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

  const isLoading = data === null && error === null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* ── Back button ───────────────────────────────────────────── */}
      <Link
        href="/lobby"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors mb-5"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
          aria-hidden="true"
        >
          <path
            fillRule="evenodd"
            d="M17 10a.75.75 0 0 1-.75.75H5.612l4.158 3.96a.75.75 0 1 1-1.04 1.08l-5.5-5.25a.75.75 0 0 1 0-1.08l5.5-5.25a.75.75 0 1 1 1.04 1.08L5.612 9.25H16.25A.75.75 0 0 1 17 10Z"
            clipRule="evenodd"
          />
        </svg>
        Back
      </Link>

      {/* ── Header ────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="h-7 w-48 rounded-full bg-gray-200 animate-pulse mb-1" />
      ) : (
        <h1 className="text-2xl font-bold text-gray-900 leading-tight">
          {data?.game.name ?? "Participants"}
        </h1>
      )}

      {/* ── Player count ──────────────────────────────────────────── */}
      {isLoading ? (
        <div className="h-4 w-28 rounded-full bg-gray-200 animate-pulse mt-1 mb-6" />
      ) : (
        <p className="mt-1 mb-6 text-sm text-gray-500">
          {data ? `${data.players.length} player${data.players.length !== 1 ? "s" : ""}` : ""}
        </p>
      )}

      {/* ── Error state ───────────────────────────────────────────── */}
      {error && (
        <div className="rounded-xl bg-red-50 border border-red-100 p-4 text-sm text-red-600">
          {error}
        </div>
      )}

      {/* ── Avatar grid ───────────────────────────────────────────── */}
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
              team1Name={data.game.team1_name}
              team2Name={data.game.team2_name}
            />
          ))}
        </div>
      )}
    </div>
  );
}
