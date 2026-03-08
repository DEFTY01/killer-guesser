"use client";

import { useEffect, useState } from "react";

interface VoteCountdownProps {
  /** ISO datetime string for when the vote window opens (nullable). */
  voteWindowStart: string | null;
  /** ISO datetime string for when the vote window closes (nullable). */
  voteWindowEnd: string | null;
}

/**
 * Counts down to the end of the vote window.
 *
 * Only rendered when the current time is strictly within
 * [voteWindowStart, voteWindowEnd].  Outside that interval the component
 * returns null so it takes up no space in the layout.
 */
export function VoteCountdown({
  voteWindowStart,
  voteWindowEnd,
}: VoteCountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!voteWindowStart || !voteWindowEnd) return;

    const startMs = Date.parse(voteWindowStart);
    const endMs = Date.parse(voteWindowEnd);

    if (isNaN(startMs) || isNaN(endMs)) return;

    function tick() {
      const now = Date.now();
      const inWindow = now >= startMs && now < endMs;
      setIsVisible(inWindow);
      if (inWindow) {
        setRemaining(Math.max(0, Math.floor((endMs - now) / 1000)));
      }
    }

    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [voteWindowStart, voteWindowEnd]);

  if (!isVisible || remaining === null) return null;

  const hours = Math.floor(remaining / 3600);
  const minutes = Math.floor((remaining % 3600) / 60);
  const seconds = remaining % 60;

  const parts = [
    hours > 0 ? `${hours}h` : null,
    `${String(minutes).padStart(2, "0")}m`,
    `${String(seconds).padStart(2, "0")}s`,
  ].filter(Boolean);

  return (
    <div
      role="timer"
      aria-live="polite"
      aria-label="Time remaining to vote"
      className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-amber-800"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 shrink-0 text-amber-500"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5Z"
          clipRule="evenodd"
        />
      </svg>
      <span className="text-sm font-medium">
        Time remaining to vote:{" "}
        <span className="font-bold tabular-nums">{parts.join(" ")}</span>
      </span>
    </div>
  );
}
