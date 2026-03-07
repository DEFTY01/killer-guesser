"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/Button";

interface AvatarUploadProps {
  playerId: string;
  currentAvatarUrl?: string | null;
  onSuccess?: (url: string) => void;
}

const MAX_SIZE_MB = 5;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export function AvatarUpload({
  playerId,
  currentAvatarUrl,
  onSuccess,
}: AvatarUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(
    currentAvatarUrl ?? null
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);

    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Only JPEG, PNG, WebP, and GIF are allowed.");
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      setError(`File must be smaller than ${MAX_SIZE_MB} MB.`);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreview(objectUrl);
  }

  async function handleUpload() {
    const file = inputRef.current?.files?.[0];
    if (!file) return;

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("playerId", playerId);

    try {
      const res = await fetch("/api/avatar", { method: "POST", body: formData });
      const json = await res.json();

      if (!json.success) {
        setError(json.error ?? "Upload failed.");
        return;
      }

      if (preview) onSuccess?.(preview);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col items-center gap-4">
      {/* Avatar preview — always 500 × 500 after processing */}
      <div
        className="relative h-40 w-40 overflow-hidden rounded-full border-4 border-indigo-200 bg-gray-100 cursor-pointer"
        onClick={() => inputRef.current?.click()}
        role="button"
        aria-label="Choose avatar"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") inputRef.current?.click();
        }}
      >
        {preview ? (
          <Image
            src={preview}
            alt="Avatar preview"
            fill
            className="object-cover"
            sizes="160px"
            unoptimized={preview.startsWith("blob:")}
          />
        ) : (
          <span className="absolute inset-0 flex items-center justify-center text-4xl">
            🎭
          </span>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ALLOWED_TYPES.join(",")}
        className="sr-only"
        onChange={handleFileChange}
        aria-label="Upload avatar file"
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => inputRef.current?.click()}
          type="button"
        >
          Choose image
        </Button>
        {inputRef.current?.files?.[0] && (
          <Button
            size="sm"
            onClick={handleUpload}
            loading={loading}
            type="button"
          >
            Upload
          </Button>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Image is resized to 500 × 500 px automatically.
      </p>
    </div>
  );
}
