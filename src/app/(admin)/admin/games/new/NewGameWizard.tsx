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
  assignments: Record<number, "team1" | "team2">;
}

interface Step3State {
  specialRoleCount: number;
  fullyRandom: boolean;
  roleChances: Record<number, number>; // roleId → percent
  murderItemUrl: string | null;
  murderItemName: string;
}

const HH_MM_RE = /^\d{2}:\d{2}$/;

// ── Helpers ───────────────────────────────────────────────────────

function randomizeTeams(
  ids: number[],
): Record<number, "team1" | "team2"> {
  // Fisher-Yates shuffle for a uniform random permutation
  const shuffled = [...ids];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const half = Math.ceil(shuffled.length / 2);
  const result: Record<number, "team1" | "team2"> = {};
  shuffled.forEach((id, i) => {
    result[id] = i < half ? "team1" : "team2";
  });
  return result;
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
    assignments: {},
  });
  const [step2Error, setStep2Error] = useState<string | null>(null);

  // ── Step 3 state ──────────────────────────────────────────────
  const initialRoleChances: Record<number, number> = {};
  for (const r of roles) {
    initialRoleChances[r.id] = r.chance_percent;
  }
  const [step3, setStep3] = useState<Step3State>({
    specialRoleCount: 0,
    fullyRandom: false,
    roleChances: initialRoleChances,
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
      // Remove assignment if deselected
      const assignments = { ...prev.assignments };
      if (!selected.includes(id)) delete assignments[id];
      return { ...prev, selectedIds: selected, assignments };
    });
  }

  function setAssignment(id: number, team: "team1" | "team2") {
    setStep2((prev) => ({
      ...prev,
      assignments: { ...prev.assignments, [id]: team },
    }));
  }

  function handleRandomize() {
    setStep2((prev) => ({
      ...prev,
      assignments: randomizeTeams(prev.selectedIds),
    }));
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
      players: step2.selectedIds.map((id) => ({
        user_id: id,
        team: step2.assignments[id] ?? null,
      })),
      special_role_count: step3.fullyRandom ? null : step3.specialRoleCount,
      role_chances: JSON.stringify(step3.roleChances),
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

          {/* Player avatar grid */}
          <p className="text-sm font-medium text-gray-700 mb-2">
            Select players{" "}
            <span className="text-gray-400 font-normal">
              ({step2.selectedIds.length} selected)
            </span>
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
                const assignment = step2.assignments[player.id];
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
                    {isSelected && assignment && (
                      <span
                        className={`text-xs font-semibold ${assignment === "team1" ? "text-blue-600" : "text-rose-600"}`}
                      >
                        {assignment === "team1"
                          ? step2.team1Name || "Team 1"
                          : step2.team2Name || "Team 2"}
                      </span>
                    )}
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

          {/* Team assignment for selected players */}
          {step2.selectedIds.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-medium text-gray-700">
                  Assign teams
                </p>
                <button
                  type="button"
                  onClick={handleRandomize}
                  className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
                >
                  🎲 Randomize Teams
                </button>
              </div>
              <div className="rounded-lg border divide-y overflow-hidden">
                {selectedPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between px-3 py-2 bg-white hover:bg-gray-50"
                  >
                    <span className="text-sm text-gray-800">{player.name}</span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAssignment(player.id, "team1")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors
                          ${step2.assignments[player.id] === "team1" ? "bg-blue-500 text-white" : "border border-blue-300 text-blue-600 hover:bg-blue-50"}`}
                      >
                        {step2.team1Name || "Team 1"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAssignment(player.id, "team2")}
                        className={`rounded px-2 py-0.5 text-xs font-medium transition-colors
                          ${step2.assignments[player.id] === "team2" ? "bg-rose-500 text-white" : "border border-rose-300 text-rose-600 hover:bg-rose-50"}`}
                      >
                        {step2.team2Name || "Team 2"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

          {/* Fully random toggle */}
          <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 mb-5">
            <div>
              <p className="text-sm font-medium text-gray-800">Fully Random</p>
              <p className="text-xs text-gray-500">
                Assign roles completely at random, ignoring chance percentages
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={step3.fullyRandom}
              onClick={() =>
                setStep3((p) => ({ ...p, fullyRandom: !p.fullyRandom }))
              }
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500
                ${step3.fullyRandom ? "bg-indigo-600" : "bg-gray-200"}`}
            >
              <span
                className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${step3.fullyRandom ? "translate-x-6" : "translate-x-1"}`}
              />
            </button>
          </div>

          {/* Special role count (only when not fully random) */}
          {!step3.fullyRandom && (
            <div className="mb-5">
              <label
                htmlFor="role-count"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Number of special roles
              </label>
              <input
                id="role-count"
                type="number"
                min={0}
                value={step3.specialRoleCount}
                onChange={(e) =>
                  setStep3((p) => ({
                    ...p,
                    specialRoleCount: Math.max(0, parseInt(e.target.value) || 0),
                  }))
                }
                className="w-32 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          )}

          {/* Role chance sliders */}
          {roles.length > 0 && !step3.fullyRandom && (
            <div className="mb-5">
              <p className="text-sm font-medium text-gray-700 mb-3">
                Role chance percentages
              </p>
              <div className="space-y-3">
                {roles.map((role) => (
                  <div key={role.id}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span
                          className="inline-block w-3 h-3 rounded-full"
                          style={{ backgroundColor: role.color_hex }}
                        />
                        <span className="text-sm text-gray-700">
                          {role.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          ({role.team})
                        </span>
                      </div>
                      <span className="text-sm font-medium text-gray-800 w-10 text-right">
                        {step3.roleChances[role.id] ?? role.chance_percent}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={step3.roleChances[role.id] ?? role.chance_percent}
                      onChange={(e) =>
                        setStep3((p) => ({
                          ...p,
                          roleChances: {
                            ...p.roleChances,
                            [role.id]: parseInt(e.target.value),
                          },
                        }))
                      }
                      aria-label={`${role.name} chance`}
                      className="w-full accent-indigo-600"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

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

      {/* ── Step 4: Review & Submit ──────────────────────────────── */}
      {step === 4 && (
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900 mb-5">
            Review & Start
          </h2>

          {/* Summary card */}
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

            {/* Teams */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Teams
              </p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="font-medium text-blue-700 mb-1">
                    {step2.team1Name || "Team 1"}
                  </p>
                  {selectedPlayers
                    .filter((p) => step2.assignments[p.id] === "team1")
                    .map((p) => (
                      <p key={p.id} className="text-gray-600 text-xs">
                        {p.name}
                      </p>
                    ))}
                  {selectedPlayers.filter(
                    (p) => step2.assignments[p.id] === "team1",
                  ).length === 0 && (
                    <p className="text-gray-400 text-xs italic">
                      No players assigned
                    </p>
                  )}
                </div>
                <div>
                  <p className="font-medium text-rose-700 mb-1">
                    {step2.team2Name || "Team 2"}
                  </p>
                  {selectedPlayers
                    .filter((p) => step2.assignments[p.id] === "team2")
                    .map((p) => (
                      <p key={p.id} className="text-gray-600 text-xs">
                        {p.name}
                      </p>
                    ))}
                  {selectedPlayers.filter(
                    (p) => step2.assignments[p.id] === "team2",
                  ).length === 0 && (
                    <p className="text-gray-400 text-xs italic">
                      No players assigned
                    </p>
                  )}
                </div>
              </div>
              {selectedPlayers.filter((p) => !step2.assignments[p.id])
                .length > 0 && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 italic">
                    Unassigned:{" "}
                    {selectedPlayers
                      .filter((p) => !step2.assignments[p.id])
                      .map((p) => p.name)
                      .join(", ")}
                  </p>
                </div>
              )}
            </div>

            {/* Roles */}
            <div className="px-4 py-3">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Roles
              </p>
              {step3.fullyRandom ? (
                <p className="text-gray-700">
                  Fully random assignment enabled
                </p>
              ) : (
                <dl className="space-y-1">
                  <div className="flex justify-between">
                    <dt className="text-gray-500">Special role count</dt>
                    <dd className="font-medium">{step3.specialRoleCount}</dd>
                  </div>
                  {roles.length > 0 && (
                    <div className="mt-1">
                      <dt className="text-gray-500 mb-1">Chance overrides</dt>
                      <div className="flex flex-wrap gap-2">
                        {roles.map((r) => {
                          const chance =
                            step3.roleChances[r.id] ?? r.chance_percent;
                          const changed = chance !== r.chance_percent;
                          return (
                            <span
                              key={r.id}
                              className={`text-xs rounded px-1.5 py-0.5 ${changed ? "bg-indigo-100 text-indigo-700 font-medium" : "bg-gray-100 text-gray-500"}`}
                            >
                              {r.name}: {chance}%
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </dl>
              )}
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
