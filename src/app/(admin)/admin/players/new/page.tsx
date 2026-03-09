"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";

/**
 * /admin/players/new
 *
 * Form to create a new player account.
 * - Name text input (all accounts are players — no role dropdown).
 * - Optional avatar file input (webp/gif only) with live browser preview.
 * - On submit: uploads avatar to /api/upload/avatar (if selected), then
 *   calls POST /api/admin/players with the returned URL.
 */
export default function NewPlayerPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setAvatarFile(file);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(file ? URL.createObjectURL(file) : null);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Name is required.");
      return;
    }

    setSaving(true);
    try {
      let avatarUrl: string | null = null;

      // Step 1: upload avatar if one was selected.
      if (avatarFile) {
        const formData = new FormData();
        formData.append("file", avatarFile);

        const uploadRes = await fetch("/api/upload/avatar", {
          method: "POST",
          body: formData,
        });

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          setError(data?.error ?? "Avatar upload failed.");
          return;
        }

        const uploadData = await uploadRes.json();
        avatarUrl = uploadData.url ?? null;
      }

      // Step 2: create the player.
      const createRes = await fetch("/api/admin/players", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), avatar_url: avatarUrl }),
      });

      if (!createRes.ok) {
        const data = await createRes.json().catch(() => ({}));
        setError(data?.error ?? "Failed to create player.");
        return;
      }

      router.push("/admin/players");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">New Player</h1>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Name */}
        <div>
          <label
            htmlFor="name"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Name <span aria-hidden="true">*</span>
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Player name"
          />
        </div>

        {/* Avatar upload with live preview */}
        <div>
          <label
            htmlFor="avatar"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Avatar <span className="text-gray-400">(webp, gif, png or jpg, max 4 MB)</span>
          </label>

          {previewUrl && (
            <div className="mb-3">
              <Image
                src={previewUrl}
                alt="Avatar preview"
                width={80}
                height={80}
                className="rounded-full object-cover border border-gray-200"
                unoptimized
              />
            </div>
          )}

          <input
            ref={fileInputRef}
            id="avatar"
            type="file"
            accept="image/webp,image/gif,image/png,image/jpeg"
            onChange={handleFileChange}
            className="block text-sm text-gray-600 file:mr-3 file:rounded-lg file:border file:border-gray-200 file:bg-gray-50 file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-gray-700 hover:file:bg-gray-100"
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving…" : "Save Player"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
