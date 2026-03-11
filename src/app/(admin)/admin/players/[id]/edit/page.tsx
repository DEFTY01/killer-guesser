"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import Image from "next/image";
import { blobImageSrc } from "@/lib/blob-image";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import type { User } from "@/types";

interface EditPlayerPageProps {
  params: Promise<{ id: string }>;
}

export default function EditPlayerPage({ params }: EditPlayerPageProps) {
  const router = useRouter();
  // Extract id from params - in client components, we need to handle the Promise
  const [playerId, setPlayerId] = useState<number | null>(null);

  useEffect(() => {
    async function extractId() {
      const { id } = await (params as Promise<{ id: string }>);
      const numericId = Number(id);
      console.log("[EditPlayer] Extracted ID from params:", {
        originalId: id,
        numericId,
        type: typeof numericId,
      });
      setPlayerId(numericId);
    }
    extractId();
  }, [params]);

  const [player, setPlayer] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [updating, setUpdating] = useState(false);
  const [success, setSuccess] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<{
    apiResponse?: unknown;
    fetchStatus?: number;
    timestamp?: string;
  }>({});

  // Fetch player data
  useEffect(() => {
    if (playerId === null) return;

    async function fetchPlayer() {
      try {
        console.log("[EditPlayer] Fetching player data for ID:", playerId);
        const res = await fetch(`/api/admin/players/${playerId}`);

        const debug = {
          fetchStatus: res.status,
          contentType: res.headers.get("content-type"),
          timestamp: new Date().toISOString(),
        };

        console.log("[EditPlayer] Fetch response:", debug);

        // Check if response is valid
        if (!res.ok) {
          const text = await res.text();
          console.error("[EditPlayer] Error response body:", text);
          setError(
            `API error: ${res.status} ${res.statusText}. Body: ${text}`
          );
          setDebugInfo({
            ...debug,
            apiResponse: text,
          });
          setLoading(false);
          return;
        }

        // Attempt to parse JSON with better error handling
        let json;
        try {
          json = await res.json();
          console.log("[EditPlayer] Parsed JSON response:", json);
        } catch (parseErr) {
          const text = await res.text();
          console.error(
            "[EditPlayer] JSON parse error. Response text:",
            text,
            "Error:",
            parseErr
          );
          setError(
            `Failed to parse API response: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`
          );
          setDebugInfo({
            ...debug,
            apiResponse: `Parse error: ${text}`,
          });
          setLoading(false);
          return;
        }

        if (!json.success) {
          console.error("[EditPlayer] API returned success=false:", json);
          setError(json.error ?? "Failed to load player");
          setDebugInfo({
            ...debug,
            apiResponse: json,
          });
          setLoading(false);
          return;
        }

        console.log("[EditPlayer] Successfully loaded player:", json.data);
        setPlayer(json.data);
        setName(json.data.name);
        setAvatarPreview(json.data.avatar_url);
        setLoading(false);
      } catch (err) {
        console.error("[EditPlayer] Fetch error:", err);
        setError(
          `Failed to fetch player: ${err instanceof Error ? err.message : String(err)}`
        );
        setDebugInfo({
          timestamp: new Date().toISOString(),
          apiResponse: err instanceof Error ? err.message : String(err),
        });
        setLoading(false);
      }
    }

    fetchPlayer();
  }, [playerId]);

  async function handleUpdateName() {
    if (!name.trim() || !playerId) {
      setError("Name cannot be empty");
      return;
    }

    setUpdating(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to update name");
        setUpdating(false);
        return;
      }

      setPlayer(json.data);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to update name:", err);
      setError("Failed to update name");
    } finally {
      setUpdating(false);
    }
  }

  async function handleAvatarSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
    ];
    if (!allowedTypes.includes(file.type)) {
      setError("Only JPEG, PNG, WebP, and GIF are allowed.");
      return;
    }

    const maxSizeMB = 5;
    if (file.size > maxSizeMB * 1024 * 1024) {
      setError(`File must be smaller than ${maxSizeMB} MB.`);
      return;
    }

    setError(null);
    setAvatarFile(file);
    const objectUrl = URL.createObjectURL(file);
    setAvatarPreview(objectUrl);
  }

  async function handleUploadAvatar() {
    if (!avatarFile || !playerId) return;

    setUploadingAvatar(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", avatarFile);
    formData.append("playerId", playerId.toString());

    try {
      const res = await fetch("/api/avatar", {
        method: "POST",
        body: formData,
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "Upload failed.");
        setUploadingAvatar(false);
        return;
      }

      // Update player with new avatar URL
      if (player) {
        setPlayer({ ...player, avatar_url: json.data.avatarUrl });
      }

      setAvatarFile(null);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      console.error("Failed to upload avatar:", err);
      setError("Network error. Failed to upload avatar.");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleDeletePlayer() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }

    if (!playerId) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/admin/players/${playerId}`, {
        method: "DELETE",
      });

      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "Failed to delete player");
        setDeleting(false);
        setDeleteConfirm(false);
        return;
      }

      // Redirect to players list
      router.push("/admin/players");
    } catch (err) {
      console.error("Failed to delete player:", err);
      setError("Failed to delete player");
      setDeleting(false);
      setDeleteConfirm(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="space-y-6">
        <Link
          href="/admin/players"
          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          ← Back to Players
        </Link>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">Player not found</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header & Back Link */}
      <div className="space-y-4">
        <Link
          href="/admin/players"
          className="inline-flex items-center text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          ← Back to Players
        </Link>
        <h1 className="text-2xl font-bold text-gray-900">Edit Player</h1>
      </div>

      {/* Alert Messages */}
      {typeof error === "string" && error.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm text-green-800">✓ Changes saved successfully</p>
        </div>
      )}

      {/* Debug Panel */}
      {(debugInfo.fetchStatus != null || debugInfo.apiResponse != null) && (
        <details className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
          <summary className="cursor-pointer font-medium text-yellow-900">
            🔍 Debug Information
          </summary>
          <div className="mt-3 space-y-2 text-xs font-mono text-yellow-800">
            <div>
              <strong>Player ID:</strong> {playerId || "null"}
            </div>
            <div>
              <strong>API Status:</strong> {debugInfo.fetchStatus || "N/A"}
            </div>
            <div>
              <strong>Timestamp:</strong> {debugInfo.timestamp}
            </div>
            {debugInfo.apiResponse != null && (
              <div className="mt-2 break-all whitespace-pre-wrap border-t border-yellow-200 pt-2">
                <strong>API Response:</strong>
                <pre className="overflow-auto max-h-32 bg-white p-2 rounded text-yellow-900">
                  {JSON.stringify(debugInfo.apiResponse, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </details>
      )}

      {/* Main Content Grid */}
      <div className="grid gap-6 md:grid-cols-3">
        {/* Left: Avatar Management */}
        <div className="md:col-span-1">
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Avatar</h2>

            {/* Avatar Preview */}
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                {avatarPreview ? (
                  <div className="relative h-40 w-40 rounded-full overflow-hidden border-4 border-indigo-200">
                    <Image
                      src={blobImageSrc(avatarPreview)}
                      alt={`${player.name} avatar`}
                      fill
                      className="object-cover"
                      unoptimized={
                        avatarPreview.startsWith("blob:") ||
                        avatarPreview.startsWith("data:")
                      }
                    />
                  </div>
                ) : (
                  <div className="w-40 h-40 rounded-full bg-gray-100 border-4 border-indigo-200 flex items-center justify-center text-4xl">
                    🎭
                  </div>
                )}
              </div>

              {/* Upload Input */}
              <input
                type="file"
                id="avatar-upload"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleAvatarSelect}
                className="hidden"
              />

              {/* Upload Actions */}
              <button
                type="button"
                onClick={() => document.getElementById("avatar-upload")?.click()}
                className="inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-gray-400 min-h-[44px] px-3 py-1.5 text-sm"
              >
                Choose Image
              </button>

              {avatarFile && (
                <Button
                  size="sm"
                  onClick={handleUploadAvatar}
                  loading={uploadingAvatar}
                >
                  Upload Avatar
                </Button>
              )}

              <p className="text-xs text-gray-400 text-center">
                Resized to 500 × 500 px automatically
              </p>
            </div>
          </div>
        </div>

        {/* Right: Player Info */}
        <div className="md:col-span-2 space-y-6">
          {/* Name Section */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Player Information
            </h2>

            <div className="space-y-4">
              <div>
                <label
                  htmlFor="name"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Display Name
                </label>
                <input
                  id="name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  placeholder="Enter player name"
                />
              </div>

              <div className="flex gap-3">
                <Button
                  onClick={handleUpdateName}
                  loading={updating}
                  disabled={name === player.name}
                >
                  Save Name
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setName(player.name)}
                >
                  Reset
                </Button>
              </div>
            </div>
          </div>

          {/* Player Details & Actions */}
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              Account Details
            </h2>

            <div className="space-y-3 text-sm mb-6">
              <div className="flex justify-between">
                <span className="text-gray-600">Player ID:</span>
                <span className="font-mono font-medium text-gray-900">
                  {player.id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Role:</span>
                <span className="font-medium text-gray-900 capitalize">
                  {player.role}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Status:</span>
                <span
                  className={`font-medium ${
                    player.is_active === 1
                      ? "text-green-700"
                      : "text-gray-500"
                  }`}
                >
                  {player.is_active === 1 ? "Active" : "Inactive"}
                </span>
              </div>
            </div>

            {/* Delete Button */}
            <div className="pt-4 border-t">
              {!deleteConfirm ? (
                <Button
                  variant="danger"
                  onClick={handleDeletePlayer}
                  className="w-full"
                >
                  Delete Player
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-red-700 font-medium">
                    Are you sure? This will permanently delete the player and
                    all associated game data.
                  </p>
                  <div className="flex gap-3">
                    <Button
                      variant="danger"
                      onClick={handleDeletePlayer}
                      loading={deleting}
                      className="flex-1"
                    >
                      Confirm Delete
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => setDeleteConfirm(false)}
                      disabled={deleting}
                      className="flex-1"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
