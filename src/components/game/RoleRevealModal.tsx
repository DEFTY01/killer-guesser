"use client";

import { useState } from "react";
import { Cards } from "@phosphor-icons/react";
import { Modal } from "@/components/ui/Modal";
import { readableOn, roleColorOrDefault } from "@/components/game/roleColor";

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
 *
 * Contrast: the admin-chosen role color only fills a header band whose text
 * color is computed from luminance. Description text sits on the neutral
 * surface so it holds AA for any role color.
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
  const band = roleColorOrDefault(roleColor);

  return (
    <Modal
      className="modal-full"
      aria-labelledby="role-reveal-title"
      dismissible={flipped}
      onClose={onClose}
    >
      <div className="flex flex-col items-center gap-6">
        {/* Flip card */}
        <div
          className={`h-[min(22rem,70svh)] w-[min(16rem,76vw)] [perspective:1200px] ${
            flipped ? "" : "cursor-pointer"
          }`}
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
        >
          <div
            className={`relative h-full w-full transition-transform duration-[600ms] ease-[cubic-bezier(0.77,0,0.175,1)] [transform-style:preserve-3d] ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            {/* Front face (mystery card) */}
            <div className="card absolute inset-0 flex flex-col items-center justify-center gap-4 bg-elevated [backface-visibility:hidden]">
              <Cards className="size-16 text-accent" aria-hidden="true" />
              <p className="px-4 text-center text-base font-semibold text-fg">
                Your role is…
              </p>
              <p className="text-xs text-muted">Tap to reveal</p>
            </div>

            {/* Back face (role reveal) */}
            <div className="card absolute inset-0 flex flex-col overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <p className="px-5 pt-5 text-center text-xs font-semibold text-muted">
                Your Role
              </p>
              <div
                className="mx-4 mt-2 rounded-control px-4 py-5 text-center"
                style={{ backgroundColor: band, color: readableOn(band) }}
              >
                <p
                  id="role-reveal-title"
                  className="font-display text-3xl font-bold leading-tight"
                >
                  {roleName ?? "Unknown"}
                </p>
              </div>
              <div className="flex flex-1 flex-col items-center gap-3 overflow-y-auto p-5">
                {teamName && (
                  <span className="pill bg-elevated px-4 py-1 text-sm text-fg">
                    {teamName}
                  </span>
                )}
                {roleDescription && (
                  <p className="text-center text-sm leading-relaxed text-muted">
                    {roleDescription}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {flipped && (
          <button type="button" onClick={onClose} className="btn btn-primary px-8">
            Got it!
          </button>
        )}
      </div>
    </Modal>
  );
}
