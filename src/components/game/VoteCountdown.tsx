"use client";

import { useEffect, useState } from "react";
import { Timer } from "@phosphor-icons/react";

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

  // No aria-live here: the value changes every second and would be announced
  // continuously. role="timer" keeps it discoverable without the noise.
  return (
    <div
      role="timer"
      aria-label="Time remaining to vote"
      className="callout callout-accent items-center justify-center"
    >
      <Timer className="size-5 shrink-0 text-accent" aria-hidden="true" />
      <span className="text-sm font-medium">
        Time remaining to vote:{" "}
        <span className="font-semibold tabular-nums">{parts.join(" ")}</span>
      </span>
    </div>
  );
}
