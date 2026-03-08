"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";

interface ThemeSettingsClientProps {
  initialLightUrl: string | null;
  initialDarkUrl: string | null;
}

/**
 * ThemeSettingsClient
 *
 * Two upload zones side-by-side: Light Mode Background and Dark Mode Background.
 * Each zone shows a current image preview, a file input that uploads via
 * /api/upload/background, and a "Reset to Default" button that clears the URL.
 */
export default function ThemeSettingsClient({
  initialLightUrl,
  initialDarkUrl,
}: ThemeSettingsClientProps) {
  const [lightUrl, setLightUrl] = useState<string | null>(initialLightUrl);
  const [darkUrl, setDarkUrl] = useState<string | null>(initialDarkUrl);
  const [lightStatus, setLightStatus] = useState<string | null>(null);
  const [darkStatus, setDarkStatus] = useState<string | null>(null);
  const lightInputRef = useRef<HTMLInputElement>(null);
  const darkInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(
    async (
      file: File,
      mode: "light" | "dark",
      setStatus: (s: string | null) => void,
      setUrl: (u: string | null) => void,
    ) => {
      setStatus("Uploading…");
      try {
        const fd = new FormData();
        fd.append("file", file);
        const uploadRes = await fetch("/api/upload/background", {
          method: "POST",
          body: fd,
        });
        if (!uploadRes.ok) {
          const err = await uploadRes.json().catch(() => ({}));
          setStatus(`Upload failed: ${err.error ?? uploadRes.statusText}`);
          return;
        }
        const { url } = (await uploadRes.json()) as { url: string };

        const patchRes = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "light" ? { bg_light_url: url } : { bg_dark_url: url },
          ),
        });
        if (!patchRes.ok) {
          setStatus("Upload succeeded but failed to save URL.");
          return;
        }
        setUrl(url);
        setStatus("Saved ✓");
        setTimeout(() => setStatus(null), 3000);
      } catch {
        setStatus("An unexpected error occurred.");
      }
    },
    [],
  );

  const handleReset = useCallback(
    async (
      mode: "light" | "dark",
      setStatus: (s: string | null) => void,
      setUrl: (u: string | null) => void,
    ) => {
      setStatus("Resetting…");
      try {
        const res = await fetch("/api/admin/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "light" ? { bg_light_url: null } : { bg_dark_url: null },
          ),
        });
        if (!res.ok) {
          setStatus("Failed to reset.");
          return;
        }
        setUrl(null);
        setStatus("Reset ✓");
        setTimeout(() => setStatus(null), 3000);
      } catch {
        setStatus("An unexpected error occurred.");
      }
    },
    [],
  );

  return (
    <section aria-labelledby="theme-settings-heading" className="mb-8">
      <h2
        id="theme-settings-heading"
        className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3"
      >
        Theme Settings
      </h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {/* Light Mode */}
        <UploadZone
          label="Light Mode Background"
          currentUrl={lightUrl}
          status={lightStatus}
          inputRef={lightInputRef}
          defaultColor="#F7FBFF"
          onFileChange={(file) =>
            uploadFile(file, "light", setLightStatus, setLightUrl)
          }
          onReset={() => handleReset("light", setLightStatus, setLightUrl)}
        />

        {/* Dark Mode */}
        <UploadZone
          label="Dark Mode Background"
          currentUrl={darkUrl}
          status={darkStatus}
          inputRef={darkInputRef}
          defaultColor="#0D1B2A"
          onFileChange={(file) =>
            uploadFile(file, "dark", setDarkStatus, setDarkUrl)
          }
          onReset={() => handleReset("dark", setDarkStatus, setDarkUrl)}
        />
      </div>
    </section>
  );
}

// ── Internal helpers ──────────────────────────────────────────────

function statusClass(status: string): string {
  if (status.includes("✓")) return "text-xs text-green-600";
  const lower = status.toLowerCase();
  if (lower.includes("fail") || lower.includes("error")) {
    return "text-xs text-red-600";
  }
  return "text-xs text-gray-500";
}

interface UploadZoneProps {
  label: string;
  currentUrl: string | null;
  status: string | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  defaultColor: string;
  onFileChange: (file: File) => void;
  onReset: () => void;
}

function UploadZone({
  label,
  currentUrl,
  status,
  inputRef,
  defaultColor,
  onFileChange,
  onReset,
}: UploadZoneProps) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      {/* Preview */}
      <div
        className="relative w-full h-36 flex items-center justify-center text-sm font-medium"
        style={{
          background: currentUrl ? undefined : defaultColor,
          backgroundImage: currentUrl ? `url(${currentUrl})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          color: currentUrl ? "white" : "#6b7280",
        }}
      >
        {currentUrl ? (
          <Image
            src={currentUrl}
            alt={`${label} preview`}
            fill
            style={{ objectFit: "cover" }}
            unoptimized
          />
        ) : (
          <span>Default ({defaultColor})</span>
        )}
      </div>

      {/* Controls */}
      <div className="p-4 space-y-3">
        <p className="text-sm font-medium text-gray-800">{label}</p>

        {status && (
          <p className={statusClass(status)}>{status}</p>
        )}

        <div className="flex gap-2 flex-wrap">
          <label className="inline-flex items-center rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 transition-colors cursor-pointer">
            Choose Image
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onFileChange(file);
                e.target.value = "";
              }}
            />
          </label>

          {currentUrl && (
            <button
              type="button"
              onClick={onReset}
              className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Reset to Default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
