"use client";

import { useState, useTransition, useCallback, useEffect } from "react";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { GameStatus } from "@/types";

// ── Types ─────────────────────────────────────────────────────────

interface GameRow {
  id: string;
  name: string;
  status: GameStatus;
  start_time: number;
  vote_window_start: string | null;
  vote_window_end: string | null;
  timezone: string;
  team1_name: string;
  team2_name: string;
  winner_team: string | null;
  created_at: number;
  /** 1 = team1 is the Evil team; 0 = team2 is the Evil team */
  evil_team_is_team1: number;
}

type SettingsRow = {
  game_id: string;
  special_role_count: number | null;
  role_chances: string | null;
  bg_light_url: string | null;
  bg_dark_url: string | null;
  murder_item_url: string | null;
  murder_item_name: string | null;
  revive_cooldown_seconds: number | null;
  team1_max_players: number | null;
  team2_max_players: number | null;
} | null;

interface PlayerRow {
  id: number;
  game_id: string;
  user_id: number;
  team: "team1" | "team2" | null;
  role_id: number | null;
  is_dead: number;
  died_at: number | null;
  has_tipped: number;
  name: string;
  avatar_url: string | null;
  role_name: string | null;
  role_color: string | null;
  role_team: string | null;
}

interface RoleOption {
  id: number;
  name: string;
  color_hex: string;
  team: string;
  is_evil: number;
}

interface VoteWindowOverrideRow {
  id: number;
  game_id: string;
  day_date: string;
  window_start: string;
  window_end: string;
  created_at: number;
}

interface GameEditorClientProps {
  game: GameRow;
  settings: SettingsRow;
  initialPlayers: PlayerRow[];
  allRoles: RoleOption[];
}

// ── Helpers ───────────────────────────────────────────────────────

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

const STATUS_STYLES: Record<GameStatus, string> = {
  scheduled: "bg-yellow-50 text-yellow-700 border-yellow-200",
  active: "bg-green-50 text-green-700 border-green-200",
  closed: "bg-gray-50 text-gray-600 border-gray-200",
  deleted: "bg-red-50 text-red-400 border-red-200",
};

function StatusBadge({ status }: { status: GameStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[status]}`}
    >
      {status}
    </span>
  );
}

// ── Component ─────────────────────────────────────────────────────

export default function GameEditorClient({
  game: initialGame,
  initialPlayers,
  allRoles,
}: GameEditorClientProps) {
  const router = useRouter();
  const [game, setGame] = useState<GameRow>(initialGame);
  const [players, setPlayers] = useState<PlayerRow[]>(initialPlayers);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSpoilers, setShowSpoilers] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Vote window editing state
  const [voteStart, setVoteStart] = useState(initialGame.vote_window_start ?? "");
  const [voteEnd, setVoteEnd] = useState(initialGame.vote_window_end ?? "");
  const [voteWindowSaving, setVoteWindowSaving] = useState(false);

  // Timezone editing state
  const [timezone, setTimezone] = useState(initialGame.timezone ?? "UTC");
  const [timezoneSaving, setTimezoneSaving] = useState(false);

  // Per-day override state
  const todayStr = new Date().toISOString().slice(0, 10);
  const [overrideDate, setOverrideDate] = useState(todayStr);
  const [overrideStart, setOverrideStart] = useState("");
  const [overrideEnd, setOverrideEnd] = useState("");
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [overrideToast, setOverrideToast] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<VoteWindowOverrideRow[]>([]);
  const [overridesLoading, setOverridesLoading] = useState(true);
  const [overrideDeleteBusy, setOverrideDeleteBusy] = useState<Set<string>>(new Set());

  // Per-row busy states
  const [deadBusy, setDeadBusy] = useState<Set<number>>(new Set());
  const [roleBusy, setRoleBusy] = useState<Set<number>>(new Set());

  // ── Game-level actions ─────────────────────────────────────────

  const gameAction = useCallback(
    async (action: "start" | "close_voting" | "close" | "delete") => {
      if (
        action === "delete" &&
        !window.confirm(
          "Permanently delete this game and all related records? This cannot be undone.",
        )
      ) {
        return;
      }

      setActionError(null);

      // Optimistic update
      if (action === "start") {
        setGame((g) => ({ ...g, status: "active" }));
      } else if (action === "close") {
        setGame((g) => ({ ...g, status: "closed" }));
      } else if (action === "close_voting") {
        setGame((g) => ({
          ...g,
          vote_window_start: null,
          vote_window_end: null,
        }));
      }

      try {
        const res = await fetch(`/api/admin/games/${game.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        });

        const json = await res.json();
        if (!json.success) {
          setActionError(json.error ?? "Unknown error");
          // Revert optimistic update
          setGame(initialGame);
          return;
        }

        if (action === "delete") {
          router.push("/admin/games");
          return;
        }

        setGame(json.data);
      } catch {
        setActionError("Failed to update game status. Please try again.");
        setGame(initialGame);
      }
    },
    [game.id, initialGame, router],
  );

  // ── Reroll actions ─────────────────────────────────────────────

  const reroll = useCallback(
    async (type: "teams" | "roles") => {
      setActionError(null);

      startTransition(async () => {
        try {
          const res = await fetch(
            `/api/admin/games/${game.id}/reroll?type=${type}`,
            { method: "POST" },
          );

          const json = await res.json();
          if (!json.success) {
            setActionError(json.error ?? "Unknown error");
            return;
          }

          // Merge updated player data (team / role_id) back into state.
          // We need fresh role metadata too — re-fetch from the server.
          const fullRes = await fetch(`/api/admin/games/${game.id}`);
          const fullJson = await fullRes.json();
          if (fullJson.success) {
            setPlayers(fullJson.data.players);
          }
        } catch {
          setActionError("Failed to re-roll. Please try again.");
        }
      });
    },
    [game.id],
  );

  // ── Per-player actions ─────────────────────────────────────────

  const toggleDead = useCallback(
    async (player: PlayerRow) => {
      const newDead = player.is_dead === 1 ? 0 : 1;

      // Optimistic update
      setPlayers((ps) =>
        ps.map((p) =>
          p.id === player.id
            ? { ...p, is_dead: newDead, died_at: newDead === 1 ? nowUnix() : null }
            : p,
        ),
      );
      setDeadBusy((s) => new Set(s).add(player.id));

      try {
        const res = await fetch(
          `/api/admin/games/${game.id}/players/${player.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_dead: newDead }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          // Revert
          setPlayers((ps) =>
            ps.map((p) => (p.id === player.id ? player : p)),
          );
          setActionError(json.error ?? "Unknown error");
        }
      } catch {
        setPlayers((ps) =>
          ps.map((p) => (p.id === player.id ? player : p)),
        );
        setActionError("Failed to update player status. Please try again.");
      } finally {
        setDeadBusy((s) => {
          const next = new Set(s);
          next.delete(player.id);
          return next;
        });
      }
    },
    [game.id],
  );

  const changeRole = useCallback(
    async (player: PlayerRow, roleId: number | null) => {
      const role = allRoles.find((r) => r.id === roleId) ?? null;

      // Optimistic update
      setPlayers((ps) =>
        ps.map((p) =>
          p.id === player.id
            ? {
                ...p,
                role_id: roleId,
                role_name: role?.name ?? null,
                role_color: role?.color_hex ?? null,
                role_team: role?.team ?? null,
              }
            : p,
        ),
      );
      setRoleBusy((s) => new Set(s).add(player.id));

      try {
        const res = await fetch(
          `/api/admin/games/${game.id}/players/${player.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role_id: roleId }),
          },
        );
        const json = await res.json();
        if (!json.success) {
          setPlayers((ps) =>
            ps.map((p) => (p.id === player.id ? player : p)),
          );
          setActionError(json.error ?? "Unknown error");
        }
      } catch {
        setPlayers((ps) =>
          ps.map((p) => (p.id === player.id ? player : p)),
        );
        setActionError("Failed to update player role. Please try again.");
      } finally {
        setRoleBusy((s) => {
          const next = new Set(s);
          next.delete(player.id);
          return next;
        });
      }
    },
    [game.id, allRoles],
  );

  // ── Vote window update ─────────────────────────────────────────

  const updateVoteWindow = useCallback(async () => {
    setActionError(null);
    setVoteWindowSaving(true);
    try {
      const res = await fetch(`/api/admin/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "update_vote_window",
          vote_window_start: voteStart || null,
          vote_window_end: voteEnd || null,
        }),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error ?? "Unknown error");
        return;
      }
      setGame(json.data);
    } catch {
      setActionError("Failed to update vote window. Please try again.");
    } finally {
      setVoteWindowSaving(false);
    }
  }, [game.id, voteStart, voteEnd]);

  // ── Timezone update ────────────────────────────────────────────

  const updateTimezone = useCallback(async () => {
    setActionError(null);
    setTimezoneSaving(true);
    try {
      const res = await fetch(`/api/admin/games/${game.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update_timezone", timezone }),
      });
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error ?? "Unknown error");
        return;
      }
      setGame(json.data);
    } catch {
      setActionError("Failed to update timezone. Please try again.");
    } finally {
      setTimezoneSaving(false);
    }
  }, [game.id, timezone]);

  // ── Load overrides on mount ────────────────────────────────────

  const loadOverrides = useCallback(async () => {
    setOverridesLoading(true);
    try {
      const res = await fetch(`/api/admin/games/${game.id}/vote-window-override`);
      const json = await res.json();
      if (json.success) {
        setOverrides(json.data);
      }
    } catch {
      // silently ignore
    } finally {
      setOverridesLoading(false);
    }
  }, [game.id]);

  useEffect(() => {
    void loadOverrides();
  }, [loadOverrides]);

  // ── Save per-day override ──────────────────────────────────────

  const saveOverride = useCallback(async () => {
    if (!overrideStart || !overrideEnd) {
      setActionError("Both start and end times are required.");
      return;
    }
    setActionError(null);
    setOverrideSaving(true);
    try {
      const res = await fetch(
        `/api/admin/games/${game.id}/vote-window-override`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            day_date: overrideDate,
            window_start: overrideStart,
            window_end: overrideEnd,
          }),
        },
      );
      const json = await res.json();
      if (!json.success) {
        setActionError(json.error ?? "Unknown error");
        return;
      }
      setOverrideToast(`Override saved for ${overrideDate}`);
      setTimeout(() => setOverrideToast(null), 3000);
      await loadOverrides();
    } catch {
      setActionError("Failed to save override. Please try again.");
    } finally {
      setOverrideSaving(false);
    }
  }, [game.id, overrideDate, overrideStart, overrideEnd, loadOverrides]);

  // ── Delete per-day override ────────────────────────────────────

  const deleteOverride = useCallback(
    async (dayDate: string) => {
      setOverrideDeleteBusy((s) => new Set(s).add(dayDate));
      try {
        await fetch(
          `/api/admin/games/${game.id}/vote-window-override/${dayDate}`,
          { method: "DELETE" },
        );
        await loadOverrides();
      } catch {
        // silently ignore
      } finally {
        setOverrideDeleteBusy((s) => {
          const next = new Set(s);
          next.delete(dayDate);
          return next;
        });
      }
    },
    [game.id, loadOverrides],
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="max-w-5xl space-y-6">
      {/* ── Status bar ───────────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm flex flex-wrap items-center gap-4">
        <h1 className="text-xl font-bold text-gray-900 flex-1 min-w-0 truncate">
          {game.name}
        </h1>
        <StatusBadge status={game.status} />
        <span className="text-sm text-gray-500">
          Start:{" "}
          <span className="font-medium text-gray-700">
            {new Date(game.start_time * 1000).toLocaleString()}
          </span>
        </span>
        {game.vote_window_start ? (
          <span className="text-sm text-gray-500">
            Vote window:{" "}
            <span className="font-medium text-gray-700">
              {game.vote_window_start} – {game.vote_window_end} ({game.timezone})
            </span>
          </span>
        ) : (
          <span className="text-sm text-gray-400 italic">No vote window</span>
        )}
      </div>

      {/* ── Timezone editor ───────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Game Timezone
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="game-timezone" className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <span className="text-xs text-gray-500">IANA timezone</span>
            <input
              id="game-timezone"
              type="text"
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              placeholder="e.g. Europe/Budapest"
              aria-label="Game timezone (IANA string)"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            loading={timezoneSaving}
            onClick={updateTimezone}
            aria-label="Save timezone"
          >
            Save timezone
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Vote window HH:MM times are interpreted in this timezone.
        </p>
      </div>

      {/* ── Vote window editor ────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-3">
          Vote Window ({game.timezone}, HH:MM)
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="vote-window-start" className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Start</span>
            <input
              id="vote-window-start"
              type="time"
              value={voteStart}
              onChange={(e) => setVoteStart(e.target.value)}
              aria-label="Vote window start time (game timezone)"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label htmlFor="vote-window-end" className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">End</span>
            <input
              id="vote-window-end"
              type="time"
              value={voteEnd}
              onChange={(e) => setVoteEnd(e.target.value)}
              aria-label="Vote window end time (game timezone)"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            loading={voteWindowSaving}
            onClick={updateVoteWindow}
            aria-label="Save vote window"
          >
            Save window
          </Button>
          {(voteStart || voteEnd) && (
            <button
              type="button"
              onClick={() => {
                setVoteStart("");
                setVoteEnd("");
              }}
              className="text-xs text-gray-400 hover:text-gray-600 underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* ── Per-day override section ──────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm space-y-4">
        <h2 className="text-sm font-semibold text-gray-700">
          Today&apos;s Override
        </h2>

        {/* Resolved window for today */}
        <div className="flex items-center gap-2 text-sm">
          {(() => {
            const todayOverride = overrides.find((o) => o.day_date === todayStr);
            if (todayOverride) {
              return (
                <>
                  <span className="font-medium text-gray-800">
                    {todayOverride.window_start} – {todayOverride.window_end}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                    Override active
                  </span>
                </>
              );
            }
            if (game.vote_window_start && game.vote_window_end) {
              return (
                <>
                  <span className="font-medium text-gray-800">
                    {game.vote_window_start} – {game.vote_window_end}
                  </span>
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                    Using default
                  </span>
                </>
              );
            }
            return (
              <span className="text-gray-400 italic">No window configured</span>
            );
          })()}
        </div>

        {/* Set override form */}
        <div className="flex flex-wrap items-end gap-3">
          <label htmlFor="override-date" className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Date</span>
            <input
              id="override-date"
              type="date"
              value={overrideDate}
              onChange={(e) => setOverrideDate(e.target.value)}
              aria-label="Override date"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label htmlFor="override-start" className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Start</span>
            <input
              id="override-start"
              type="time"
              value={overrideStart}
              onChange={(e) => setOverrideStart(e.target.value)}
              aria-label="Override window start time"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <label htmlFor="override-end" className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">End</span>
            <input
              id="override-end"
              type="time"
              value={overrideEnd}
              onChange={(e) => setOverrideEnd(e.target.value)}
              aria-label="Override window end time"
              className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </label>
          <Button
            variant="secondary"
            size="sm"
            loading={overrideSaving}
            onClick={saveOverride}
            aria-label="Set override"
          >
            Set Override
          </Button>
        </div>

        {/* Toast */}
        {overrideToast && (
          <p className="text-sm text-green-600 font-medium" role="status">
            {overrideToast}
          </p>
        )}

        {/* Existing overrides table */}
        {!overridesLoading && overrides.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Date
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Window
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-600">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {overrides.map((o) => (
                  <tr key={o.day_date} className="border-b last:border-0">
                    <td className="px-4 py-2 font-mono text-gray-700">
                      {o.day_date}
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {o.window_start} – {o.window_end}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => deleteOverride(o.day_date)}
                        disabled={overrideDeleteBusy.has(o.day_date)}
                        className="rounded px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-red-500"
                        aria-label={`Delete override for ${o.day_date}`}
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {overridesLoading && (
          <p className="text-xs text-gray-400">Loading overrides…</p>
        )}
        {!overridesLoading && overrides.length === 0 && (
          <p className="text-xs text-gray-400">No overrides set.</p>
        )}
      </div>

      {/* ── Error banner ─────────────────────────────────────── */}
      {actionError && (
        <div
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center justify-between"
        >
          <span>{actionError}</span>
          <button
            onClick={() => setActionError(null)}
            className="ml-4 text-red-400 hover:text-red-600"
            aria-label="Dismiss error"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Players panel ────────────────────────────────────── */}
      <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700">
            Players ({players.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowSpoilers((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
              showSpoilers
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
            }`}
            aria-pressed={showSpoilers}
            aria-label={showSpoilers ? "Hide team and role assignments" : "Show team and role assignments"}
          >
            {showSpoilers ? "Hide Spoilers 🙈" : "Show Spoilers 👁"}
          </button>
        </div>

        {players.length === 0 ? (
          <p className="px-5 py-4 text-sm text-gray-500">No players.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b bg-gray-50/50">
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                    Player
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                    Team
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr
                    key={p.id}
                    className={`border-b last:border-0 transition-colors ${
                      p.is_dead ? "bg-gray-50/70 opacity-70" : "hover:bg-gray-50"
                    }`}
                  >
                    {/* Player */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="relative w-7 h-7 rounded-full overflow-hidden bg-gray-200 shrink-0">
                          {p.avatar_url ? (
                            <Image
                              src={blobImageSrc(p.avatar_url)}
                              alt={p.name}
                              fill
                              className="object-cover"
                              sizes="28px"
                            />
                          ) : (
                            <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-gray-500">
                              {p.name[0]?.toUpperCase()}
                            </span>
                          )}
                        </div>
                        <span className="font-medium text-gray-900">
                          {p.name}
                        </span>
                      </div>
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {showSpoilers
                        ? (p.team === "team1"
                            ? game.team1_name
                            : p.team === "team2"
                              ? game.team2_name
                              : "—")
                        : "—"}
                    </td>

                    {/* Role — inline select when spoilers on, hidden otherwise */}
                    <td className="px-4 py-3">
                      {showSpoilers ? (
                        <div className="flex items-center gap-2">
                          {p.role_color && (
                            <span
                              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: p.role_color }}
                              aria-hidden="true"
                            />
                          )}
                          <select
                            aria-label={`Role for ${p.name}`}
                            value={p.role_id ?? ""}
                            disabled={roleBusy.has(p.id)}
                            onChange={(e) =>
                              changeRole(
                                p,
                                e.target.value === "" ? null : Number(e.target.value),
                              )
                            }
                            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                          >
                            <option value="">— No role —</option>
                            {allRoles
                              .filter((r) => {
                                if (p.team === null) return true;
                                // Determine if this player is on the evil team
                                const isEvilTeamPlayer =
                                  (p.team === "team1" && game.evil_team_is_team1 === 1) ||
                                  (p.team === "team2" && game.evil_team_is_team1 === 0);
                                // Evil team → only evil roles; Good team → only good roles
                                if (isEvilTeamPlayer) return r.is_evil === 1;
                                return r.is_evil === 0;
                              })
                              .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <span className="text-gray-500">—</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {p.is_dead ? (
                        <span className="inline-flex items-center gap-1 text-red-500 font-medium text-xs">
                          <span aria-hidden="true">☠</span> Dead
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-green-600 font-medium text-xs">
                          <span aria-hidden="true">♥</span> Alive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={() => toggleDead(p)}
                        disabled={deadBusy.has(p.id)}
                        className={`rounded px-2.5 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 ${
                          p.is_dead
                            ? "bg-green-100 text-green-700 hover:bg-green-200 focus:ring-green-500"
                            : "bg-red-100 text-red-700 hover:bg-red-200 focus:ring-red-500"
                        }`}
                        aria-label={
                          p.is_dead ? `Revive ${p.name}` : `Mark ${p.name} as dead`
                        }
                      >
                        {p.is_dead ? "Revive" : "Mark Dead"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Actions panel ────────────────────────────────────── */}
      <div className="rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 mb-4">Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="secondary"
            size="sm"
            loading={isPending}
            onClick={() => reroll("teams")}
            aria-label="Re-roll team assignments"
          >
            🎲 Re-roll Teams
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={isPending}
            onClick={() => reroll("roles")}
            aria-label="Re-roll role assignments"
          >
            🎲 Re-roll Roles
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={game.status !== "scheduled"}
            onClick={() => gameAction("start")}
            aria-label="Start this game"
          >
            ▶️ Start Game
          </Button>
          <Button
            variant="secondary"
            size="sm"
            disabled={!game.vote_window_start}
            onClick={() => gameAction("close_voting")}
            aria-label="Close the current vote window"
          >
            🗳 Close Voting
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={game.status === "closed"}
            onClick={() => gameAction("close")}
            aria-label="End this game"
          >
            🏁 End Game
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => gameAction("delete")}
            aria-label="Permanently delete this game"
          >
            🗑 Delete Game
          </Button>
        </div>
      </div>
    </div>
  );
}
