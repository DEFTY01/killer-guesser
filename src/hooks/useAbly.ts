"use client";

import Ably from "ably";
import { useEffect, useCallback, useRef } from "react";
import type { Message } from "ably";

// ── Singleton client ──────────────────────────────────────────────
// Initialised once per browser session. Auth goes through /api/ably/token,
// which issues subscribe-only tokens, so no API key reaches the browser.

let ablyClient: InstanceType<typeof Ably.Realtime> | null = null;

function getAblyClient(): InstanceType<typeof Ably.Realtime> {
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({ authUrl: "/api/ably/token" });
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
 * @param enabled     - When false nothing is subscribed (e.g. a channel this
 *                      user is not allowed to read).
 */
export function useAbly(
  channelName: string,
  eventName: string,
  onMessage: (message: Message) => void,
  enabled: boolean = true,
): void {
  const callbackRef = useRef(onMessage);
  useEffect(() => {
    callbackRef.current = onMessage;
  });

  const stableCallback = useCallback(
    (message: Message) => callbackRef.current(message),
    [],
  );

  const activeSubRef = useRef<{ channelName: string; eventName: string } | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    if (
      activeSubRef.current?.channelName === channelName &&
      activeSubRef.current?.eventName === eventName
    ) {
      return undefined;
    }

    let channel: ReturnType<InstanceType<typeof Ably.Realtime>["channels"]["get"]> | null = null;
    try {
      const client = getAblyClient();
      channel = client.channels.get(channelName);
      // Attach failures (realtime offline or unconfigured) must not surface as
      // unhandled rejections; the board resyncs on visibility/online instead.
      void Promise.resolve(channel.subscribe(eventName, stableCallback)).catch(() => {});
      activeSubRef.current = { channelName, eventName };
    } catch {
      return undefined;
    }

    return () => {
      try {
        channel?.unsubscribe(eventName, stableCallback);
        activeSubRef.current = null;
      } catch {
        // Ignore cleanup errors
      }
    };
  }, [channelName, eventName, stableCallback, enabled]);
}
