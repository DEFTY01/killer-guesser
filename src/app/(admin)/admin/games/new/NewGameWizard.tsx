"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import type { User, Role } from "@/types";

// ── Types ─────────────────────────────────────────────────────────

interface Step1State {
  name: string;
  startDate: string; // datetime-local value "YYYY-MM-DDTHH:MM"
  voteStart: string; // "HH:MM"
  voteEnd: string;   // "HH:MM"
}

interface Step2State {
  selectedIds: number[];
  team1Name: string;
  team2Name: string;
  team1MaxPlayers: number;
  team2MaxPlayers: number;
}

interface TeamRoleEntry {
  roleId: number;
  chancePercent: number;
  enabled: boolean;
}

interface Step3State {
  team1Roles: TeamRoleEntry[];
  team1SpecialCount: number;
  team1FullyRandom: boolean;
  team2Roles: TeamRoleEntry[];
  team2SpecialCount: number;
  team2FullyRandom: boolean;
  murderItemUrl: string | null;
  murderItemName: string;
}

const HH_MM_RE = /^\d{2}:\d{2}$/;

// ── Helpers ───────────────────────────────────────────────────────

/** Check if a role name (case-insensitive) indicates the Killer role. */
function isKillerRole(role: Role): boolean {
  return role.name.toLowerCase() === "killer";
}

// ── Sub-components ────────────────────────────────────────────────

function StepIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = [
    { n: 1, label: "Details" },
    { n: 2, label: "Players" },
    { n: 3, label: "Roles" },
    { n: 4, label: "Review" },
  ] as const;

  return (
    <nav aria-label="Wizard steps" className="flex items-center gap-2 mb-8">
      {steps.map(({ n, label }, idx) => (
        <div key={n} className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 ${current === n ? "text-indigo-600 font-semibold" : current > n ? "text-gray-400" : "text-gray-300"}`}
          >
            <span
              className={`inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors
                ${current === n ? "border-indigo-600 bg-indigo-50 text-indigo-600" : current > n ? "border-gray-300 bg-gray-100 text-gray-400" : "border-gray-200 bg-white text-gray-300"}`}
            >
              {n}
            </span>
            <span className="text-sm hidden sm:inline">{label}</span>
          </div>
          {idx < steps.length - 1 && (
            <div
              className={`h-px w-8 sm:w-12 transition-colors ${current > n ? "bg-gray-300" : "bg-gray-200"}`}
            />
          )}
        </div>
      ))}
    </nav>
  );
}

function AvatarCircle({ user }: { user: User }) {
  return (
    <div className="relative w-12 h-12 rounded-full overflow-hidden bg-gray-200 shrink-0 mx-auto">
      {user.avatar_url ? (
        <Image
          src={user.avatar_url}
          alt={user.name}
          fill
          className="object-cover"
          sizes="48px"
        />
      ) : (
        <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-500">
          {user.name[0]?.toUpperCase()}
        </span>
      )}
    </div>
  );
}

// ── Main wizard component ─────────────────────────────────────────

interface Props {
  players: User[];
  roles: Role[];
}

export function NewGameWizard({ players, roles }: Props) {
  const router = useRouter();

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // ── Step 1 state ──────────────────────────────────────────────
  const [step1, setStep1] = useState<Step1State>({
    name: "",
    startDate: "",
    voteStart: "",
    voteEnd: "",
  });
  const [step1Errors, setStep1Errors] = useState<Partial<Step1State>>({});

  // ── Step 2 state ──────────────────────────────────────────────
  const [step2, setStep2] = useState<Step2State>({
    selectedIds: [],
    team1Name: "Good",
    team2Name: "Evil",
    team1MaxPlayers: 1,
    team2MaxPlayers: 1,
  });
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // ── Step 3 state ──────────────────────────────────────────────
  // Build initial role entries for each team
  const team1EligibleRoles = roles.filter(
    (r) => r.team === "team1" || r.team === "any",
  );
  const team2EligibleRoles = roles.filter(
    (r) => (r.team === "team2" || r.team === "any") && !isKillerRole(r),
  );

  const initialTeam1Roles: TeamRoleEntry[] = team1EligibleRoles.map((r) => ({
    roleId: r.id,
    chancePercent: r.chance_percent,
    enabled: isKillerRole(r), // Killer always pre-checked
  }));
  const initialTeam2Roles: TeamRoleEntry[] = team2EligibleRoles.map((r) => ({
    roleId: r.id,
    chancePercent: r.chance_percent,
    enabled: false,
  }));

  const [step3, setStep3] = useState<Step3State>({
    team1Roles: initialTeam1Roles,
    team1SpecialCount: 0,
    team1FullyRandom: false,
    team2Roles: initialTeam2Roles,
    team2SpecialCount: 0,
    team2FullyRandom: false,
    murderItemUrl: null,
    murderItemName: "",
  });
  const [uploadingMurder, setUploadingMurder] = useState(false);
  const [murderUploadError, setMurderUploadError] = useState<string | null>(
    null,
  );
  const murderFileRef = useRef<HTMLInputElement>(null);

  // ── Step 1 validation & advance ───────────────────────────────

  function validateStep1(): boolean {
    const errs: Partial<Step1State> = {};
    if (!step1.name.trim()) errs.name = "Name is required";
    if (!step1.startDate) {
      errs.startDate = "Start date/time is required";
    } else if (isNaN(new Date(step1.startDate).getTime())) {
      errs.startDate = "Invalid date/time";
    }
    if (step1.voteStart && !HH_MM_RE.test(step1.voteStart))
      errs.voteStart = "Must be HH:MM";
    if (step1.voteEnd && !HH_MM_RE.test(step1.voteEnd))
      errs.voteEnd = "Must be HH:MM";
    setStep1Errors(errs);
    return Object.keys(errs).length === 0;
  }

  function handleStep1Next() {
    if (validateStep1()) setStep(2);
  }

  // ── Step 2 helpers ────────────────────────────────────────────

  function togglePlayer(id: number) {
    setStep2((prev) => {
      const selected = prev.selectedIds.includes(id)
        ? prev.selectedIds.filter((x) => x !== id)
        : [...prev.selectedIds, id];
      return { ...prev, selectedIds: selected };
    });
  }

  /** Inline warning if selected player count exceeds combined team caps. */
  function getCapWarning(): string | null {
    const total = step2.selectedIds.length;
    const maxCapacity = step2.team1MaxPlayers + step2.team2MaxPlayers;
    if (total > 0 && total > maxCapacity) {
      return `overflow will go to ${step2.team2Name || "Team 2"}`;
    }
    return null;
  }

  function handleStep2Next() {
    if (step2.selectedIds.length === 0) {
      setStep2Error("Select at least one player.");
      return;
    }
    setStep2Error(null);
    setStep(3);
  }

  // ── Step 3: murder item upload ────────────────────────────────

  async function handleMurderItemUpload(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMurder(true);
    setMurderUploadError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/upload/murder-item", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMurderUploadError(data?.error ?? "Upload failed");
        return;
      }
      setStep3((prev) => ({ ...prev, murderItemUrl: data.url }));
    } finally {
      setUploadingMurder(false);
    }
  }

  // ── Submit ─────────────────────────────────────────────────────

  async function handleSubmit() {
    setSubmitError(null);
    setSubmitting(true);

    const startTime = Math.floor(
      new Date(step1.startDate).getTime() / 1000,
    );

    const body = {
      name: step1.name.trim(),
      start_time: startTime,
      vote_window_start: step1.voteStart || null,
      vote_window_end: step1.voteEnd || null,
      team1_name: step2.team1Name.trim() || "Good",
      team2_name: step2.team2Name.trim() || "Evil",
      player_ids: step2.selectedIds,
      team1_max_players: step2.team1MaxPlayers,
      team2_max_players: step2.team2MaxPlayers,
      team1Roles: step3.team1Roles
        .filter((r) => r.enabled)
        .map((r) => ({ roleId: r.roleId, chancePercent: r.chancePercent })),
      team1SpecialCount: step3.team1SpecialCount,
      team2Roles: step3.team2Roles
        .filter((r) => r.enabled)
        .map((r) => ({ roleId: r.roleId, chancePercent: r.chancePercent })),
      team2SpecialCount: step3.team2SpecialCount,
      murder_item_url: step3.murderItemUrl ?? null,
      murder_item_name: step3.murderItemName.trim() || null,
    };

    try {
      const res = await fetch("/api/admin/games", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSubmitError(data?.error ?? "Failed to create game");
        return;
      }
      router.push(`/admin/games/${data.data.id}`);
    } catch {
      setSubmitError("Network error — please try again");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────

  const selectedPlayers = players.filter((p) =>
    step2.selectedIds.includes(p.id),
  );

  // ── Step renders ───────────────────────────────────────────────

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-4 mb-6">
        <a
          href="/admin/games"
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Games
        </a>
        <h1 className="text-2xl font-bold text-gray-900">New Game</h1>
      </div>

      <StepIndicator current={step} />

      {/* ── Step 1: Game Details ─────────────────────────────────── */}
      {step === 1 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">
            Game Details
          </h2>

          <div className="space-y-4">
            {/* Name */}
            <div>
              <label
                htmlFor="game-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Game name <span className="text-red-500">*</span>
              </label>
              <input
                id="game-name"
                type="text"
                value={step1.name}
                onChange={(e) =>
                  setStep1((p) => ({ ...p, name: e.target.value }))
                }
                placeholder="e.g. Friday Night Killer"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {step1Errors.name && (
                <p className="mt-1 text-xs text-red-500">{step1Errors.name}</p>
              )}
            </div>

            {/* Start date/time */}
            <div>
              <label
                htmlFor="start-date"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Start date & time <span className="text-red-500">*</span>
              </label>
              <input
                id="start-date"
                type="datetime-local"
                value={step1.startDate}
                onChange={(e) =>
                  setStep1((p) => ({ ...p, startDate: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {step1Errors.startDate && (
                <p className="mt-1 text-xs text-red-500">
                  {step1Errors.startDate}
                </p>
              )}
            </div>

            {/* Vote window */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="vote-start"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Vote window start (HH:MM)
                </label>
                <input
                  id="vote-start"
                  type="time"
                  value={step1.voteStart}
                  onChange={(e) =>
                    setStep1((p) => ({ ...p, voteStart: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {step1Errors.voteStart && (
                  <p className="mt-1 text-xs text-red-500">
                    {step1Errors.voteStart}
                  </p>
                )}
              </div>
              <div>
                <label
                  htmlFor="vote-end"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Vote window end (HH:MM)
                </label>
                <input
                  id="vote-end"
                  type="time"
                  value={step1.voteEnd}
                  onChange={(e) =>
                    setStep1((p) => ({ ...p, voteEnd: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {step1Errors.voteEnd && (
                  <p className="mt-1 text-xs text-red-500">
                    {step1Errors.voteEnd}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-end mt-6">
            <button
              type="button"
              onClick={handleStep1Next}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 2: Players & Teams ──────────────────────────────── */}
      {step === 2 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">
            Players & Teams
          </h2>

          {/* Team names */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label
                htmlFor="team1-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Team 1 name
              </label>
              <input
                id="team1-name"
                type="text"
                value={step2.team1Name}
                onChange={(e) =>
                  setStep2((p) => ({ ...p, team1Name: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="team2-name"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Team 2 name
              </label>
              <input
                id="team2-name"
                type="text"
                value={step2.team2Name}
                onChange={(e) =>
                  setStep2((p) => ({ ...p, team2Name: e.target.value }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Team caps */}
          <div className="grid grid-cols-2 gap-4 mb-6">
            <div>
              <label
                htmlFor="team1-max"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Max players in {step2.team1Name || "Team 1"}
              </label>
              <input
                id="team1-max"
                type="number"
                min={1}
                value={step2.team1MaxPlayers}
                onChange={(e) =>
                  setStep2((p) => ({
                    ...p,
                    team1MaxPlayers: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label
                htmlFor="team2-max"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Max players in {step2.team2Name || "Team 2"}
              </label>
              <input
                id="team2-max"
                type="number"
                min={1}
                value={step2.team2MaxPlayers}
                onChange={(e) =>
                  setStep2((p) => ({
                    ...p,
                    team2MaxPlayers: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Cap warning */}
          {getCapWarning() && (
            <p className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
              ⚠️ {getCapWarning()}
            </p>
          )}

          {/* Player avatar grid */}
          <p className="text-sm font-medium text-gray-700 mb-2">
            Select players{" "}
            <span className="text-gray-400 font-normal">
              ({step2.selectedIds.length} selected)
            </span>
          </p>
          <p className="text-xs text-gray-500 mb-3">
            Teams are assigned automatically by the server — no manual assignment needed.
          </p>

          {players.length === 0 ? (
            <p className="text-sm text-gray-500 mb-4">
              No players yet.{" "}
              <a
                href="/admin/players/new"
                className="text-indigo-600 hover:underline"
              >
                Add a player
              </a>
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 mb-4">
              {players.map((player) => {
                const isSelected = step2.selectedIds.includes(player.id);
                return (
                  <button
                    key={player.id}
                    type="button"
                    onClick={() => togglePlayer(player.id)}
                    aria-pressed={isSelected}
                    className={`relative flex flex-col items-center gap-1 rounded-xl border-2 p-3 text-center transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500
                      ${isSelected ? "border-indigo-500 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                  >
                    <AvatarCircle user={player} />
                    <span className="text-xs font-medium text-gray-700 truncate w-full">
                      {player.name}
                    </span>
                    {isSelected && (
                      <span
                        className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center"
                        aria-hidden="true"
                      >
                        <svg
                          viewBox="0 0 12 12"
                          className="w-2.5 h-2.5 text-white"
                          fill="currentColor"
                          aria-hidden="true"
                        >
                          <path d="M10 3L5 9 2 6" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {step2Error && (
            <p className="text-sm text-red-500 mb-3">{step2Error}</p>
          )}

          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleStep2Next}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Roles & Settings ─────────────────────────────── */}
      {step === 3 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">
            Roles & Settings
          </h2>

          {/* Two-column role configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* ── Team1 (Evil) column ──────────────────────────── */}
            <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4">
              <h3 className="text-sm font-semibold text-blue-800 mb-3">
                {step2.team1Name || "Team 1"} (Evil)
              </h3>

              {/* Fully Random toggle */}
              <div className="flex items-center justify-between rounded-lg border border-blue-100 bg-white px-3 py-2 mb-3">
                <span className="text-xs font-medium text-gray-700">Fully Random</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={step3.team1FullyRandom}
                  onClick={() => {
                    setStep3((p) => {
                      const next = !p.team1FullyRandom;
                      return {
                        ...p,
                        team1FullyRandom: next,
                        team1Roles: next
                          ? p.team1Roles.map((r) => {
                              const orig = team1EligibleRoles.find((o) => o.id === r.roleId);
                              return { ...r, enabled: true, chancePercent: orig?.chance_percent ?? r.chancePercent };
                            })
                          : p.team1Roles,
                      };
                    });
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400
                    ${step3.team1FullyRandom ? "bg-blue-600" : "bg-gray-200"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${step3.team1FullyRandom ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
              </div>

              {/* Special count */}
              <div className="mb-3">
                <label htmlFor="t1-special" className="block text-xs font-medium text-gray-600 mb-1">
                  Special roles (beyond Killer)
                </label>
                <input
                  id="t1-special"
                  type="number"
                  min={0}
                  value={step3.team1SpecialCount}
                  onChange={(e) =>
                    setStep3((p) => ({
                      ...p,
                      team1SpecialCount: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              {/* Killer validation */}
              {!step3.team1Roles.some((r) => {
                const role = team1EligibleRoles.find((o) => o.id === r.roleId);
                return role && isKillerRole(role) && r.enabled;
              }) && (
                <p className="text-xs text-red-500 mb-2">⚠ A Killer role must be enabled for this team.</p>
              )}

              {/* Role rows */}
              <div className="space-y-2">
                {step3.team1Roles.map((entry) => {
                  const role = team1EligibleRoles.find((r) => r.id === entry.roleId);
                  if (!role) return null;
                  const isKiller = isKillerRole(role);
                  return (
                    <div key={entry.roleId} className="rounded-lg border bg-white p-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          disabled={isKiller}
                          onChange={() => {
                            if (isKiller) return;
                            setStep3((p) => ({
                              ...p,
                              team1Roles: p.team1Roles.map((r) =>
                                r.roleId === entry.roleId ? { ...r, enabled: !r.enabled } : r,
                              ),
                            }));
                          }}
                          className="accent-blue-600"
                        />
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: role.color_hex }}
                        />
                        <span className="text-xs font-medium text-gray-700">{role.name}</span>
                        {isKiller && <span className="text-[10px] text-gray-400">(required)</span>}
                      </label>
                      {entry.enabled && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={entry.chancePercent}
                            onChange={(e) =>
                              setStep3((p) => ({
                                ...p,
                                team1Roles: p.team1Roles.map((r) =>
                                  r.roleId === entry.roleId
                                    ? { ...r, chancePercent: parseInt(e.target.value) }
                                    : r,
                                ),
                              }))
                            }
                            aria-label={`${role.name} chance`}
                            className="flex-1 accent-blue-600"
                          />
                          <span className="text-xs font-medium text-gray-600 w-8 text-right">
                            {entry.chancePercent}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Team2 (Good) column ──────────────────────────── */}
            <div className="rounded-lg border border-rose-200 bg-rose-50/30 p-4">
              <h3 className="text-sm font-semibold text-rose-800 mb-3">
                {step2.team2Name || "Team 2"} (Good)
              </h3>

              {/* Fully Random toggle */}
              <div className="flex items-center justify-between rounded-lg border border-rose-100 bg-white px-3 py-2 mb-3">
                <span className="text-xs font-medium text-gray-700">Fully Random</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={step3.team2FullyRandom}
                  onClick={() => {
                    setStep3((p) => {
                      const next = !p.team2FullyRandom;
                      return {
                        ...p,
                        team2FullyRandom: next,
                        team2Roles: next
                          ? p.team2Roles.map((r) => {
                              const orig = team2EligibleRoles.find((o) => o.id === r.roleId);
                              return { ...r, enabled: true, chancePercent: orig?.chance_percent ?? r.chancePercent };
                            })
                          : p.team2Roles,
                      };
                    });
                  }}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-rose-400
                    ${step3.team2FullyRandom ? "bg-rose-600" : "bg-gray-200"}`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform ${step3.team2FullyRandom ? "translate-x-4" : "translate-x-0.5"}`}
                  />
                </button>
              </div>

              {/* Special count */}
              <div className="mb-3">
                <label htmlFor="t2-special" className="block text-xs font-medium text-gray-600 mb-1">
                  Special roles (weighted draw)
                </label>
                <input
                  id="t2-special"
                  type="number"
                  min={0}
                  value={step3.team2SpecialCount}
                  onChange={(e) =>
                    setStep3((p) => ({
                      ...p,
                      team2SpecialCount: Math.max(0, parseInt(e.target.value) || 0),
                    }))
                  }
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-rose-400"
                />
                <p className="text-[10px] text-gray-400 mt-0.5">Remaining players get Survivor automatically.</p>
              </div>

              {/* Role rows */}
              <div className="space-y-2">
                {step3.team2Roles.map((entry) => {
                  const role = team2EligibleRoles.find((r) => r.id === entry.roleId);
                  if (!role) return null;
                  return (
                    <div key={entry.roleId} className="rounded-lg border bg-white p-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={entry.enabled}
                          onChange={() =>
                            setStep3((p) => ({
                              ...p,
                              team2Roles: p.team2Roles.map((r) =>
                                r.roleId === entry.roleId ? { ...r, enabled: !r.enabled } : r,
                              ),
                            }))
                          }
                          className="accent-rose-600"
                        />
                        <span
                          className="inline-block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: role.color_hex }}
                        />
                        <span className="text-xs font-medium text-gray-700">{role.name}</span>
                      </label>
                      {entry.enabled && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={entry.chancePercent}
                            onChange={(e) =>
                              setStep3((p) => ({
                                ...p,
                                team2Roles: p.team2Roles.map((r) =>
                                  r.roleId === entry.roleId
                                    ? { ...r, chancePercent: parseInt(e.target.value) }
                                    : r,
                                ),
                              }))
                            }
                            aria-label={`${role.name} chance`}
                            className="flex-1 accent-rose-600"
                          />
                          <span className="text-xs font-medium text-gray-600 w-8 text-right">
                            {entry.chancePercent}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
                {step3.team2Roles.length === 0 && (
                  <p className="text-xs text-gray-400 italic">No eligible roles found.</p>
                )}
              </div>
            </div>
          </div>

          {/* Murder item */}
          <div className="mb-2">
            <p className="text-sm font-medium text-gray-700 mb-3">
              Murder item (optional)
            </p>
            <div className="flex flex-wrap items-start gap-4">
              {step3.murderItemUrl && (
                <div className="relative w-20 h-20 rounded-lg border overflow-hidden bg-gray-50">
                  <Image
                    src={step3.murderItemUrl}
                    alt="Murder item preview"
                    fill
                    className="object-contain p-1"
                    sizes="80px"
                  />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <div>
                  <label
                    htmlFor="murder-name"
                    className="block text-xs font-medium text-gray-600 mb-1"
                  >
                    Item name
                  </label>
                  <input
                    id="murder-name"
                    type="text"
                    value={step3.murderItemName}
                    onChange={(e) =>
                      setStep3((p) => ({
                        ...p,
                        murderItemName: e.target.value,
                      }))
                    }
                    placeholder="e.g. Knife, Candlestick…"
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <input
                    ref={murderFileRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    className="hidden"
                    onChange={handleMurderItemUpload}
                  />
                  <button
                    type="button"
                    disabled={uploadingMurder}
                    onClick={() => murderFileRef.current?.click()}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                  >
                    {uploadingMurder
                      ? "Uploading…"
                      : step3.murderItemUrl
                        ? "Change image"
                        : "Upload image"}
                  </button>
                  {murderUploadError && (
                    <p className="mt-1 text-xs text-red-500">
                      {murderUploadError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-between mt-6">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
            >
              Next →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: Review & Submit (spoiler-free) ────────────────── */}
      {step === 4 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">
            Review & Start
          </h2>

          {/* Summary card — does NOT reveal team/role assignments */}
          <div className="rounded-lg border bg-gray-50 divide-y text-sm mb-6">
            {/* Game details */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Game Details
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-gray-500">Name</dt>
                  <dd className="font-medium">{step1.name}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">Start</dt>
                  <dd>
                    {step1.startDate
                      ? new Date(step1.startDate).toLocaleString()
                      : "—"}
                  </dd>
                </div>
                {step1.voteStart && (
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Vote window</dt>
                    <dd>
                      {step1.voteStart} – {step1.voteEnd}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Selected players (no team breakdown) */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Players ({selectedPlayers.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {selectedPlayers.map((p) => (
                  <span
                    key={p.id}
                    className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {p.avatar_url && (
                      <span className="relative w-4 h-4 rounded-full overflow-hidden inline-block">
                        <Image src={p.avatar_url} alt="" fill sizes="16px" className="object-cover" unoptimized />
                      </span>
                    )}
                    {p.name}
                  </span>
                ))}
              </div>
            </div>

            {/* Team settings (caps only, no assignments) */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Teams
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-gray-500">{step2.team1Name || "Team 1"} cap</dt>
                  <dd className="font-medium">{step2.team1MaxPlayers}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-500">{step2.team2Name || "Team 2"} cap</dt>
                  <dd className="font-medium">{step2.team2MaxPlayers}</dd>
                </div>
              </dl>
              <p className="text-[10px] text-gray-400 mt-1">
                Assignments will be randomised server-side on start.
              </p>
            </div>

            {/* Role config */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Role Configuration
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-blue-700 mb-1">
                    {step2.team1Name || "Team 1"}
                  </p>
                  {step3.team1FullyRandom ? (
                    <p className="text-xs text-gray-500 italic">Fully random</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">
                        Special roles: {step3.team1SpecialCount}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {step3.team1Roles.filter((r) => r.enabled).map((r) => {
                          const role = team1EligibleRoles.find((o) => o.id === r.roleId);
                          return (
                            <span
                              key={r.roleId}
                              className="text-[10px] rounded px-1.5 py-0.5 bg-blue-50 text-blue-700"
                            >
                              {role?.name ?? `Role #${r.roleId}`}: {r.chancePercent}%
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-rose-700 mb-1">
                    {step2.team2Name || "Team 2"}
                  </p>
                  {step3.team2FullyRandom ? (
                    <p className="text-xs text-gray-500 italic">Fully random</p>
                  ) : (
                    <>
                      <p className="text-xs text-gray-500">
                        Special roles: {step3.team2SpecialCount}
                      </p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {step3.team2Roles.filter((r) => r.enabled).map((r) => {
                          const role = team2EligibleRoles.find((o) => o.id === r.roleId);
                          return (
                            <span
                              key={r.roleId}
                              className="text-[10px] rounded px-1.5 py-0.5 bg-rose-50 text-rose-700"
                            >
                              {role?.name ?? `Role #${r.roleId}`}: {r.chancePercent}%
                            </span>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Murder item */}
            {(step3.murderItemName || step3.murderItemUrl) && (
              <div className="px-4 py-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Murder Item
                </p>
                <div className="flex items-center gap-3">
                  {step3.murderItemUrl && (
                    <div className="relative w-12 h-12 rounded border overflow-hidden bg-white">
                      <Image
                        src={step3.murderItemUrl}
                        alt="Murder item"
                        fill
                        className="object-contain"
                        sizes="48px"
                      />
                    </div>
                  )}
                  {step3.murderItemName && (
                    <span className="text-sm font-medium">
                      {step3.murderItemName}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {submitError && (
            <p className="text-sm text-red-500 mb-4">{submitError}</p>
          )}

          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-5 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              ← Back
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            >
              {submitting ? "Starting…" : "🚀 Start Game"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
