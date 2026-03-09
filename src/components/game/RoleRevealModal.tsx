"use client";

import { useState } from "react";

// ── Types ─────────────────────────────────────────────────────────

export interface RoleRevealModalProps {
  roleName: string | null;
  roleColor: string | null;
  roleDescription: string | null;
  teamName: string | null;
  onClose: () => void;
}

// ── RoleRevealModal ───────────────────────────────────────────────

/**
 * Full-screen flip-card modal that reveals the player's role once per session.
 *
 * - Shows a mystery card face-down initially.
 * - Tapping/clicking flips the card to reveal role name, team, and description.
 * - A "Got it!" button appears after the flip to dismiss the modal.
 */
export function RoleRevealModal({
  roleName,
  roleColor,
  roleDescription,
  teamName,
  onClose,
}: RoleRevealModalProps) {
  const [flipped, setFlipped] = useState(false);

  const reveal = () => setFlipped(true);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="role-reveal-title"
    >
      <div className="flex flex-col items-center gap-6">
        {/* Flip card */}
        <div
          style={{ perspective: "1200px", width: 240, height: 340 }}
          onClick={!flipped ? reveal : undefined}
          onKeyDown={(e) => {
            if (!flipped && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              reveal();
            }
          }}
          tabIndex={flipped ? -1 : 0}
          role={flipped ? undefined : "button"}
          aria-label={flipped ? undefined : "Tap to reveal your role"}
          className={flipped ? "" : "cursor-pointer"}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transformStyle: "preserve-3d",
              transition: "transform 0.7s cubic-bezier(0.4,0,0.2,1)",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* Front face (— mystery card) */}
            <div
              className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center gap-4 shadow-2xl"
              style={{
                backfaceVisibility: "hidden",
                background: "linear-gradient(135deg,#1e3a5f 0%,#0f2040 100%)",
                border: "2px solid rgba(255,255,255,0.12)",
              }}
            >
              <div className="text-7xl select-none">🃏</div>
              <p className="text-white text-base font-semibold text-center px-4">
                Your role is…
              </p>
              <p className="text-white/50 text-xs">Tap to reveal</p>
            </div>

            {/* Back face (— role reveal) */}
            <div
              className="absolute inset-0 rounded-3xl flex flex-col items-center justify-center gap-3 shadow-2xl p-6"
              style={{
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: roleColor
                  ? `linear-gradient(135deg,${roleColor}ee 0%,${roleColor}99 100%)`
                  : "linear-gradient(135deg,#2E6DA4ee 0%,#2E6DA499 100%)",
                border: "2px solid rgba(255,255,255,0.18)",
              }}
            >
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest">
                Your Role
              </p>
              <p
                id="role-reveal-title"
                className="text-white text-3xl font-bold text-center"
              >
                {roleName ?? "Unknown"}
              </p>
              {teamName && (
                <span className="text-white/90 text-sm font-semibold bg-white/20 px-4 py-1 rounded-full">
                  {teamName}
                </span>
              )}
              {roleDescription && (
                <p className="text-white/80 text-sm text-center leading-relaxed">
                  {roleDescription}
                </p>
              )}
            </div>
          </div>
        </div>

        {flipped && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl bg-white px-8 py-3 text-sm font-bold text-gray-900 shadow-xl hover:bg-gray-100 transition-colors focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black/80"
          >
            Got it!
          </button>
        )}
      </div>
    </div>
  );
}
