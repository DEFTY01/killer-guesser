"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeletePlayerButtonProps {
  playerId: number;
  playerName: string;
}

/**
 * Client-side button that deletes a player via DELETE /api/admin/players/[id].
 * Permanently removes the player and all related records from the database.
 * Confirms with the user before sending the request.
 */
export default function DeletePlayerButton({
  playerId,
  playerName,
}: DeletePlayerButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete player "${playerName}"? This cannot be undone.`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? "Failed to delete player.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={loading}
      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      aria-label={`Delete ${playerName}`}
    >
      {loading ? "…" : "Delete"}
    </button>
  );
}
