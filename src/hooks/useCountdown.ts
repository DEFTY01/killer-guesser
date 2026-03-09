"use client";

import { useEffect, useState } from "react";

interface CountdownResult {
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
}

function computeRemaining(target: Date): CountdownResult {
  const diff = Math.max(0, target.getTime() - Date.now());
  const isExpired = diff === 0;
  const totalSeconds = Math.floor(diff / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { hours, minutes, seconds, isExpired };
}

/**
 * Returns the remaining hours, minutes, seconds and an `isExpired` flag until
 * the given `target` Date, ticking every second.  The interval is cleaned up
 * when the component unmounts.
 */
export function useCountdown(target: Date): CountdownResult {
  const [state, setState] = useState<CountdownResult>(() =>
    computeRemaining(target),
  );

  useEffect(() => {
    const id = setInterval(() => {
      const next = computeRemaining(target);
      setState(next);
      if (next.isExpired) clearInterval(id);
    }, 1000);

    return () => clearInterval(id);
  }, [target]);

  return state;
}
