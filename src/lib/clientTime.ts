/**
 * Client-only time display utilities.
 * Uses the browser's Intl.DateTimeFormat — never hard-codes a timezone.
 * Import only from client components ("use client").
 */

/**
 * Formats a UTC millisecond timestamp as a time string (HH:MM) in the
 * browser's local timezone.
 *
 * @param utcMs - UTC timestamp in milliseconds.
 * @returns A time string like "14:32".
 */
export function toLocalTime(utcMs: number): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(utcMs));
}

/**
 * Formats a UTC millisecond timestamp as a short datetime string (e.g.
 * "Tue 14:32") in the browser's local timezone.
 *
 * @param utcMs - UTC timestamp in milliseconds.
 * @returns A datetime string like "Tue 14:32".
 */
export function toLocalDateTime(utcMs: number): string {
  const date = new Date(utcMs);
  const weekday = new Intl.DateTimeFormat(undefined, { weekday: "short" }).format(date);
  const time = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${weekday} ${time}`;
}

/**
 * Returns the number of milliseconds remaining until a future UTC timestamp.
 * Returns 0 if the timestamp is in the past.
 *
 * @param utcMs - Future UTC timestamp in milliseconds.
 * @returns Milliseconds until the timestamp, or 0 if already passed.
 */
export function msUntil(utcMs: number): number {
  return Math.max(0, utcMs - Date.now());
}
