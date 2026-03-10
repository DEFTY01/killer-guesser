"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface DeleteGameButtonProps {
  gameId: string;
  gameName: string;
}

/**
 * Client-side button that soft-deletes a game via PATCH /api/admin/games/[id]
 * with action "delete". Sets the game status to "deleted" (cascade-safe).
 * Confirms with the user before sending the request.
 */
export default function DeleteGameButton({
  gameId,
  gameName,
}: DeleteGameButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleDelete() {
    if (!confirm(`Delete game "${gameName}"? This cannot be undone.`)) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/games/${gameId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete" }),
      });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(data?.error ?? "Failed to delete game.");
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
      aria-label={`Delete ${gameName}`}
    >
      {loading ? "…" : "Delete"}
    </button>
  );
}
