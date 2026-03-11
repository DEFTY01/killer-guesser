/**
 * Server-safe timezone utilities — no external libraries.
 * Uses native Intl.DateTimeFormat and Date only.
 * All functions are pure and have no side effects.
 */

/**
 * Converts a HH:MM time string expressed in the given IANA timezone to a UTC
 * Date for "today" in that timezone.
 *
 * @param hhmm     - Time in "HH:MM" format (24-hour clock).
 * @param timezone - A valid IANA timezone identifier, e.g. "Europe/Budapest".
 * @returns A Date object representing the given wall-clock time today in the
 *          specified timezone, expressed as a UTC instant.
 */
export function gameTimeToUtc(hhmm: string, timezone: string): Date {
  const [hStr, mStr] = hhmm.split(":");
  const hours = parseInt(hStr ?? "0", 10);
  const minutes = parseInt(mStr ?? "0", 10);

  // Get today's date components in the target timezone.
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const year = parts.find((p) => p.type === "year")?.value ?? "2000";
  const month = parts.find((p) => p.type === "month")?.value ?? "01";
  const day = parts.find((p) => p.type === "day")?.value ?? "01";

  // Build a UTC-interpreted ISO string for the wall-clock moment in the zone.
  // We use the Intl API to compute offset: format a known UTC instant and
  // measure the difference.
  const candidateUtc = Date.UTC(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    hours,
    minutes,
    0,
    0,
  );

  // Compute the UTC offset for this timezone at approximately this instant.
  const offset = getUtcOffsetMs(new Date(candidateUtc), timezone);

  return new Date(candidateUtc - offset);
}

/**
 * Returns the current time expressed in the given IANA timezone as total
 * minutes since midnight local time.
 *
 * @param timezone - A valid IANA timezone identifier.
 * @returns Total minutes since midnight in the given timezone (0–1439).
 */
export function nowInZone(timezone: string): number {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);

  const hourStr = parts.find((p) => p.type === "hour")?.value ?? "0";
  const minuteStr = parts.find((p) => p.type === "minute")?.value ?? "0";

  // Intl may return "24" for midnight in hour12:false mode — normalise to 0.
  const hour = parseInt(hourStr, 10) % 24;
  const minute = parseInt(minuteStr, 10);

  return hour * 60 + minute;
}

/**
 * Formats a UTC millisecond timestamp as a locale time string (HH:MM) in the
 * given IANA timezone.
 *
 * @param utcMs    - UTC timestamp in milliseconds.
 * @param timezone - A valid IANA timezone identifier.
 * @returns A time string in "HH:MM" format (24-hour clock, zero-padded).
 *
 * @example
 * formatInZone(1_700_000_000_000, "Europe/Budapest") // → "14:32"
 */
export function formatInZone(utcMs: number, timezone: string): string {
  const date = new Date(utcMs);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";

  // Normalise "24" → "00" (midnight edge case in some Intl implementations).
  const normHour = hour === "24" ? "00" : hour;

  return `${normHour}:${minute}`;
}

/**
 * Returns the UTC millisecond boundaries for when a HH:MM vote window
 * opens and closes today in the given game timezone.
 *
 * For overnight windows (e.g. 22:00–02:00) the close boundary is moved to
 * the *next calendar day* in the game timezone, ensuring closeMs > openMs.
 *
 * @param start    - Vote window start in "HH:MM" format (game-local time).
 * @param end      - Vote window end in "HH:MM" format (game-local time).
 * @param timezone - A valid IANA timezone identifier.
 * @returns `{ openMs, closeMs }` — UTC millisecond timestamps.
 */
export function windowBoundariesUtc(
  start: string,
  end: string,
  timezone: string,
): { openMs: number; closeMs: number } {
  const openDate = gameTimeToUtc(start, timezone);
  const closeDate = gameTimeToUtc(end, timezone);

  let closeMs = closeDate.getTime();
  const openMs = openDate.getTime();

  // Handle overnight windows: if close is earlier than open (e.g. 22:00–02:00),
  // advance close by one day.
  if (closeMs <= openMs) {
    closeMs += 24 * 60 * 60 * 1000;
  }

  return { openMs, closeMs };
}

// ── Private helpers ───────────────────────────────────────────────

/**
 * Computes the UTC offset (in ms) for a given timezone at a given instant.
 * A positive result means the local time is ahead of UTC.
 */
function getUtcOffsetMs(date: Date, timezone: string): number {
  // Format a UTC wall-clock time in the target zone, then compare with
  // what the same instant looks like in UTC.
  const localParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const y = parseInt(localParts.find((p) => p.type === "year")?.value ?? "2000", 10);
  const mo = parseInt(localParts.find((p) => p.type === "month")?.value ?? "1", 10);
  const d = parseInt(localParts.find((p) => p.type === "day")?.value ?? "1", 10);
  const h = parseInt(localParts.find((p) => p.type === "hour")?.value ?? "0", 10) % 24;
  const mi = parseInt(localParts.find((p) => p.type === "minute")?.value ?? "0", 10);
  const s = parseInt(localParts.find((p) => p.type === "second")?.value ?? "0", 10);

  const localAsUtc = Date.UTC(y, mo - 1, d, h, mi, s, 0);
  return localAsUtc - date.getTime();
}
