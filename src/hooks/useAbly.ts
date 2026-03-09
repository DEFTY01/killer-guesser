"use client";

import Ably from "ably";
import { useEffect, useCallback, useRef } from "react";
import type { Message } from "ably";

// ── Singleton client ──────────────────────────────────────────────
// Initialised once per browser session using the public API key.
// The key is expected to be a token-capable key (publishable from the browser).

let ablyClient: InstanceType<typeof Ably.Realtime> | null = null;

function getAblyClient(): InstanceType<typeof Ably.Realtime> {
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({
      key: process.env.NEXT_PUBLIC_ABLY_API_KEY ?? "",
    });
  }
  return ablyClient;
}

// ── Hook ──────────────────────────────────────────────────────────

/**
 * Subscribes to an Ably channel / event pair and calls `onMessage`
 * whenever a matching message arrives.
 *
 * The Ably `Realtime` client is a singleton — only one connection is opened
 * per browser tab regardless of how many times this hook is used.
 *
 * The subscription is established once on mount and torn down on unmount.
 * Callers do not need to memoize `onMessage` — a ref keeps it up-to-date
 * without triggering a re-subscription.
 *
 * @param channelName - The Ably channel to subscribe to (use `ABLY_CHANNELS.*`).
 * @param eventName   - The event name to listen for (use `ABLY_EVENTS.*`).
 * @param onMessage   - Callback invoked with each received `Message`.
 */
export function useAbly(
  channelName: string,
  eventName: string,
  onMessage: (message: Message) => void,
): void {
  // Keep a ref to the latest callback so that the subscription never needs
  // to be re-established when the caller's closure changes between renders.
  const callbackRef = useRef(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  });

  // A stable wrapper that always delegates to the latest callback reference.
  const stableCallback = useCallback(
    (message: Message) => callbackRef.current(message),
    [],
  );

  useEffect(() => {
    let channel: ReturnType<InstanceType<typeof Ably.Realtime>["channels"]["get"]> | null = null;
    try {
      const client = getAblyClient();
      channel = client.channels.get(channelName);
      channel.subscribe(eventName, stableCallback);
    } catch {
      // Ably is unavailable (e.g. missing API key in this environment).
      // Fail silently — real-time updates won't arrive but the board is
      // still fully usable via manual refresh.
      return;
    }

    return () => {
      try {
        channel?.unsubscribe(eventName, stableCallback);
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [channelName, eventName, stableCallback]);
}
