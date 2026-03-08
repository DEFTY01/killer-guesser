"use client";

import { useState, useCallback } from "react";
import type { Role } from "@/types";
import { DEFAULT_ROLE_COLOR, ROLE_PERMISSIONS, type RolePermission } from "@/lib/role-constants";

// ── Constants ─────────────────────────────────────────────────────

const ALL_PERMISSIONS: { key: RolePermission; label: string }[] = [
  { key: "see_killer", label: "See killer" },
  { key: "revive_dead", label: "Revive dead" },
  { key: "see_votes", label: "See votes" },
  { key: "extra_vote", label: "Extra vote" },
  { key: "immunity_once", label: "Immunity once" },
];

// ── Helpers ───────────────────────────────────────────────────────

function parsePermissions(raw: string | null): RolePermission[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as RolePermission[];
  } catch {
    // ignore
  }
  return [];
}

function teamLabel(team: string) {
  if (team === "team1") return "Team 1";
  if (team === "team2") return "Team 2";
  return "Any";
}

interface AddRoleFormState {
  name: string;
  team: "team1" | "team2" | "any";
  description: string;
  color_hex: string;
  chance_percent: number;
  permissions: RolePermission[];
}

const DEFAULT_FORM: AddRoleFormState = {
  name: "",
  team: "any",
  description: "",
  color_hex: DEFAULT_ROLE_COLOR,
  chance_percent: 10,
  permissions: [],
};

// ── Component ─────────────────────────────────────────────────────

interface RolesClientProps {
  initialRoles: Role[];
}

export default function RolesClient({ initialRoles }: RolesClientProps) {
  const [roles, setRoles] = useState<Role[]>(initialRoles);
  const [editingChanceId, setEditingChanceId] = useState<number | null>(null);
  const [editingChanceValue, setEditingChanceValue] = useState<number>(0);
  const [showAddPanel, setShowAddPanel] = useState(false);
  const [form, setForm] = useState<AddRoleFormState>(DEFAULT_FORM);
  const [saving, setSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [editForm, setEditForm] = useState<AddRoleFormState>(DEFAULT_FORM);
  const [editError, setEditError] = useState<string | null>(null);
  const [editSaving, setEditSaving] = useState(false);

  // ── Chance % team warning ──────────────────────────────────────

  function teamTotal(team: "team1" | "team2" | "any", exclude?: number) {
    return roles
      .filter((r) => r.team === team && r.id !== exclude)
      .reduce((sum, r) => sum + r.chance_percent, 0);
  }

  function chanceWarning(
    team: "team1" | "team2" | "any",
    chancePercent: number,
    excludeId?: number,
  ): string | null {
    if (team === "any") return null;
    const total = teamTotal(team, excludeId) + chancePercent;
    if (total > 100)
      return `Total chance for ${teamLabel(team)} will be ${total.toFixed(0)}% (exceeds 100%)`;
    return null;
  }

  function addFormWarning(): string | null {
    return chanceWarning(form.team, form.chance_percent);
  }

  function editFormWarning(): string | null {
    if (!editingRole) return null;
    return chanceWarning(editForm.team, editForm.chance_percent, editingRole.id);
  }

  // ── Chance % inline slider ─────────────────────────────────────

  function startEditChance(role: Role) {
    setEditingChanceId(role.id);
    setEditingChanceValue(role.chance_percent);
  }

  async function commitChance(roleId: number) {
    const prev = roles.find((r) => r.id === roleId);
    if (!prev) return;

    // Optimistic update
    setRoles((old) =>
      old.map((r) =>
        r.id === roleId ? { ...r, chance_percent: editingChanceValue } : r,
      ),
    );
    setEditingChanceId(null);

    const res = await fetch(`/api/admin/roles/${roleId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chance_percent: editingChanceValue }),
    });

    if (!res.ok) {
      // Revert on failure
      setRoles((old) =>
        old.map((r) =>
          r.id === roleId ? { ...r, chance_percent: prev.chance_percent } : r,
        ),
      );
      const data = await res.json().catch(() => ({}));
      alert(data?.error ?? "Failed to update chance.");
    }
  }

  // ── Delete role ────────────────────────────────────────────────

  const handleDelete = useCallback(
    async (role: Role) => {
      if (role.is_default === 1) {
        alert("Default roles cannot be deleted.");
        return;
      }
      if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;

      const res = await fetch(`/api/admin/roles/${role.id}`, {
        method: "DELETE",
      });

      if (res.ok) {
        setRoles((old) => old.filter((r) => r.id !== role.id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? "Failed to delete role.");
      }
    },
    [],
  );

  // ── Add role ───────────────────────────────────────────────────

  async function handleAddRole(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setAddError(null);

    const res = await fetch("/api/admin/roles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        team: form.team,
        description: form.description || null,
        color_hex: form.color_hex,
        chance_percent: form.chance_percent,
        permissions: form.permissions,
      }),
    });

    const data = await res.json().catch(() => ({ success: false, error: "Unknown error" }));
    setSaving(false);

    if (!res.ok || !data.success) {
      setAddError(data.error ?? "Failed to create role.");
      return;
    }

    setRoles((old) =>
      [...old, data.data].sort((a, b) => a.name.localeCompare(b.name)),
    );
    setShowAddPanel(false);
    setForm(DEFAULT_FORM);
  }

  // ── Edit role ──────────────────────────────────────────────────

  function openEditPanel(role: Role) {
    setEditingRole(role);
    setEditForm({
      name: role.name,
      team: role.team as "team1" | "team2" | "any",
      description: role.description ?? "",
      color_hex: role.color_hex,
      chance_percent: role.chance_percent,
      permissions: parsePermissions(role.permissions),
    });
    setEditError(null);
    setShowAddPanel(false);
  }

  async function handleEditRole(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRole) return;
    setEditSaving(true);
    setEditError(null);

    const res = await fetch(`/api/admin/roles/${editingRole.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: editForm.name,
        team: editForm.team,
        description: editForm.description || null,
        color_hex: editForm.color_hex,
        chance_percent: editForm.chance_percent,
        permissions: editForm.permissions,
      }),
    });

    const data = await res.json().catch(() => ({ success: false, error: "Unknown error" }));
    setEditSaving(false);

    if (!res.ok || !data.success) {
      setEditError(data.error ?? "Failed to update role.");
      return;
    }

    setRoles((old) =>
      old
        .map((r) => (r.id === editingRole.id ? data.data : r))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
    setEditingRole(null);
  }

  // ── Permission toggle helpers ──────────────────────────────────

  function toggleFormPermission(key: RolePermission) {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  function toggleEditPermission(key: RolePermission) {
    setEditForm((f) => ({
      ...f,
      permissions: f.permissions.includes(key)
        ? f.permissions.filter((p) => p !== key)
        : [...f.permissions, key],
    }));
  }

  // ── Render ─────────────────────────────────────────────────────

  const addWarning = addFormWarning();
  const editWarning = editFormWarning();

  return (
    <div>
      {/* ── Header ───────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Roles</h1>
        <button
          onClick={() => {
            setShowAddPanel(true);
            setEditingRole(null);
          }}
          className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
        >
          + Add Role
        </button>
      </div>

      {/* ── Table ────────────────────────────────────────────────── */}
      {roles.length === 0 ? (
        <p className="text-sm text-gray-500">No roles yet.</p>
      ) : (
        <div className="rounded-xl border bg-white overflow-hidden shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50">
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Color
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Name
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Team
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Chance %
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Permissions
                </th>
                <th className="px-4 py-3 text-left font-medium text-gray-600">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {roles.map((role) => {
                const perms = parsePermissions(role.permissions);
                const isEditingChance = editingChanceId === role.id;

                return (
                  <tr
                    key={role.id}
                    className="border-b last:border-0 hover:bg-gray-50"
                  >
                    {/* Color swatch */}
                    <td className="px-4 py-3">
                      <span
                        className="inline-block w-6 h-6 rounded-full border border-gray-200"
                        style={{ backgroundColor: role.color_hex }}
                        aria-label={`Color ${role.color_hex}`}
                      />
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3 font-medium text-gray-900">
                      {role.name}
                    </td>

                    {/* Team */}
                    <td className="px-4 py-3 text-gray-600">
                      {teamLabel(role.team)}
                    </td>

                    {/* Chance % — click to reveal slider */}
                    <td className="px-4 py-3">
                      {isEditingChance ? (
                        <div className="flex items-center gap-2">
                          <input
                            type="range"
                            min={0}
                            max={100}
                            value={editingChanceValue}
                            onChange={(e) =>
                              setEditingChanceValue(Number(e.target.value))
                            }
                            className="w-24"
                            aria-label={`Chance percentage for ${role.name}`}
                          />
                          <span className="w-8 text-right text-gray-700">
                            {editingChanceValue}%
                          </span>
                          <button
                            onClick={() => commitChance(role.id)}
                            className="rounded px-2 py-0.5 text-xs font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => setEditingChanceId(null)}
                            className="rounded px-2 py-0.5 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-100 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditChance(role)}
                          className="rounded px-2 py-0.5 text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-100 transition-colors"
                          title="Click to edit chance percentage"
                        >
                          {role.chance_percent}%
                        </button>
                      )}
                    </td>

                    {/* Permissions */}
                    <td className="px-4 py-3">
                      {perms.length === 0 ? (
                        <span className="text-gray-400 text-xs">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {perms.map((p) => (
                            <span
                              key={p}
                              className="inline-flex items-center rounded-full border border-indigo-100 bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700"
                            >
                              {p.replace(/_/g, " ")}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openEditPanel(role)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(role)}
                          disabled={role.is_default === 1}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          title={
                            role.is_default === 1
                              ? "Default roles cannot be deleted"
                              : `Delete ${role.name}`
                          }
                          aria-label={`Delete ${role.name}`}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Add Role Panel ────────────────────────────────────────── */}
      {showAddPanel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90dvh]">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Add Role
            </h2>
            <form onSubmit={handleAddRole} className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label
                  htmlFor="add-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="add-name"
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="e.g. Killer"
                />
              </div>

              {/* Team */}
              <div>
                <label
                  htmlFor="add-team"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Team <span aria-hidden="true">*</span>
                </label>
                <select
                  id="add-team"
                  value={form.team}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      team: e.target.value as "team1" | "team2" | "any",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="team1">Team 1</option>
                  <option value="team2">Team 2</option>
                  <option value="any">Any</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="add-description"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="add-description"
                  rows={2}
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                  placeholder="Optional description"
                />
              </div>

              {/* Color */}
              <div>
                <label
                  htmlFor="add-color"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="add-color"
                    type="color"
                    value={form.color_hex}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, color_hex: e.target.value }))
                    }
                    className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
                  />
                  <span className="text-sm text-gray-500 font-mono">
                    {form.color_hex}
                  </span>
                </div>
              </div>

              {/* Chance % */}
              <div>
                <label
                  htmlFor="add-chance"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Chance % <span aria-hidden="true">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="add-chance"
                    type="range"
                    min={0}
                    max={100}
                    value={form.chance_percent}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        chance_percent: Number(e.target.value),
                      }))
                    }
                    className="flex-1"
                    aria-label="Chance percentage"
                  />
                  <span className="w-10 text-right text-sm font-medium text-gray-700">
                    {form.chance_percent}%
                  </span>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Permissions
                </span>
                <div className="flex flex-col gap-2">
                  {ALL_PERMISSIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(key)}
                        onChange={() => toggleFormPermission(key)}
                        className="rounded border-gray-300 accent-indigo-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Warning */}
              {addWarning && (
                <div
                  role="alert"
                  className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
                >
                  ⚠️ {addWarning}
                </div>
              )}

              {/* Error */}
              {addError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {addError}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddPanel(false);
                    setForm(DEFAULT_FORM);
                    setAddError(null);
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {saving ? "Saving…" : "Save Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Role Panel ───────────────────────────────────────── */}
      {editingRole && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-t-2xl sm:rounded-2xl bg-white p-6 shadow-xl overflow-y-auto max-h-[90dvh]">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Edit Role — {editingRole.name}
            </h2>
            <form onSubmit={handleEditRole} className="flex flex-col gap-4">
              {/* Name */}
              <div>
                <label
                  htmlFor="edit-name"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="edit-name"
                  type="text"
                  required
                  value={editForm.name}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              {/* Team */}
              <div>
                <label
                  htmlFor="edit-team"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Team <span aria-hidden="true">*</span>
                </label>
                <select
                  id="edit-team"
                  value={editForm.team}
                  onChange={(e) =>
                    setEditForm((f) => ({
                      ...f,
                      team: e.target.value as "team1" | "team2" | "any",
                    }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="team1">Team 1</option>
                  <option value="team2">Team 2</option>
                  <option value="any">Any</option>
                </select>
              </div>

              {/* Description */}
              <div>
                <label
                  htmlFor="edit-description"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Description
                </label>
                <textarea
                  id="edit-description"
                  rows={2}
                  value={editForm.description}
                  onChange={(e) =>
                    setEditForm((f) => ({ ...f, description: e.target.value }))
                  }
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                />
              </div>

              {/* Color */}
              <div>
                <label
                  htmlFor="edit-color"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    id="edit-color"
                    type="color"
                    value={editForm.color_hex}
                    onChange={(e) =>
                      setEditForm((f) => ({ ...f, color_hex: e.target.value }))
                    }
                    className="h-9 w-16 cursor-pointer rounded border border-gray-300 p-0.5"
                  />
                  <span className="text-sm text-gray-500 font-mono">
                    {editForm.color_hex}
                  </span>
                </div>
              </div>

              {/* Chance % */}
              <div>
                <label
                  htmlFor="edit-chance"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Chance % <span aria-hidden="true">*</span>
                </label>
                <div className="flex items-center gap-3">
                  <input
                    id="edit-chance"
                    type="range"
                    min={0}
                    max={100}
                    value={editForm.chance_percent}
                    onChange={(e) =>
                      setEditForm((f) => ({
                        ...f,
                        chance_percent: Number(e.target.value),
                      }))
                    }
                    className="flex-1"
                    aria-label="Chance percentage"
                  />
                  <span className="w-10 text-right text-sm font-medium text-gray-700">
                    {editForm.chance_percent}%
                  </span>
                </div>
              </div>

              {/* Permissions */}
              <div>
                <span className="block text-sm font-medium text-gray-700 mb-2">
                  Permissions
                </span>
                <div className="flex flex-col gap-2">
                  {ALL_PERMISSIONS.map(({ key, label }) => (
                    <label
                      key={key}
                      className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={editForm.permissions.includes(key)}
                        onChange={() => toggleEditPermission(key)}
                        className="rounded border-gray-300 accent-indigo-600"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Warning */}
              {editWarning && (
                <div
                  role="alert"
                  className="rounded-lg border border-yellow-200 bg-yellow-50 px-3 py-2 text-sm text-yellow-800"
                >
                  ⚠️ {editWarning}
                </div>
              )}

              {/* Error */}
              {editError && (
                <div
                  role="alert"
                  className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                >
                  {editError}
                </div>
              )}

              {/* Buttons */}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRole(null);
                    setEditError(null);
                  }}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editSaving}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {editSaving ? "Saving…" : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
