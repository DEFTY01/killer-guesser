/**
 * Vote rounds.
 *
 * A round is identified by the local calendar date (in the game's timezone) on
 * which its window opens. An overnight window (22:00–02:00) belongs to the date
 * it opens on, so a vote at 01:00 still counts for the round that opened the
 * evening before. Round numbers (votes.day) count rounds from the game's
 * start date, starting at 1.
 *
 * Everything here is pure: callers supply the clock and the window lookup.
 */

export interface RoundWindow {
  start: string;
  end: string;
}

export interface Round {
  /** Local date the window opens, "YYYY-MM-DD". */
  date: string;
  /** 1-based round number, used as votes.day. */
  number: number;
  openMs: number;
  closeMs: number;
}

export interface RoundState {
  /** The round whose window contains `nowMs`, if any. */
  open: Round | null;
  /** The most recent round whose window has already closed. */
  last: Round | null;
  /** The next round that has not opened yet. */
  upcoming: Round | null;
  /** Round number voters should see: the open round, else today's. */
  currentNumber: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parts(ms: number, timeZone: string) {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const get = (t: string) => Number(f.find((p) => p.type === t)?.value ?? 0);
  return {
    y: get("year"),
    mo: get("month"),
    d: get("day"),
    h: get("hour") % 24,
    mi: get("minute"),
    s: get("second"),
  };
}

/** Local calendar date of an instant in the given zone, "YYYY-MM-DD". */
export function localDate(ms: number, timeZone: string): string {
  const { y, mo, d } = parts(ms, timeZone);
  return `${String(y).padStart(4, "0")}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both "YYYY-MM-DD"). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / DAY_MS);
}

/**
 * UTC instant of a wall-clock time ("HH:MM") on a local date in a zone.
 * Offset is re-evaluated at the result so DST transitions land correctly.
 */
export function zonedTimeToUtcMs(date: string, hhmm: string, timeZone: string): number {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = hhmm.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, 0, 0);
  const offsetAt = (ms: number) => {
    const p = parts(ms, timeZone);
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - ms;
  };
  let guess = wall - offsetAt(wall);
  guess = wall - offsetAt(guess);
  return guess;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isValidHhmm(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function roundNumber(startTimeUnix: number, date: string, timeZone: string): number {
  const startDate = localDate(startTimeUnix * 1000, timeZone);
  return Math.max(1, daysBetween(startDate, date) + 1);
}

function buildRound(
  date: string,
  window: RoundWindow,
  startTimeUnix: number,
  timeZone: string,
): Round {
  const openMs = zonedTimeToUtcMs(date, window.start, timeZone);
  const overnight = window.end <= window.start;
  const closeMs = zonedTimeToUtcMs(overnight ? addDays(date, 1) : date, window.end, timeZone);
  return { date, number: roundNumber(startTimeUnix, date, timeZone), openMs, closeMs };
}

/**
 * Resolves which round is open now and which one closed most recently.
 * Yesterday, today and tomorrow are the candidates: a window never spans more
 * than a day, and tomorrow's tells us when voting reopens.
 */
export function resolveRoundState(args: {
  nowMs: number;
  startTimeUnix: number;
  timeZone: string;
  windowFor: (date: string) => RoundWindow | null;
}): RoundState {
  const { nowMs, startTimeUnix, timeZone, windowFor } = args;
  const today = localDate(nowMs, timeZone);

  let open: Round | null = null;
  let last: Round | null = null;
  let upcoming: Round | null = null;

  for (const date of [addDays(today, -1), today, addDays(today, 1)]) {
    const window = windowFor(date);
    if (!window || !isValidHhmm(window.start) || !isValidHhmm(window.end)) continue;
    const round = buildRound(date, window, startTimeUnix, timeZone);
    if (nowMs >= round.openMs && nowMs < round.closeMs) {
      open = round;
    } else if (nowMs >= round.closeMs && (!last || round.closeMs > last.closeMs)) {
      last = round;
    } else if (nowMs < round.openMs && (!upcoming || round.openMs < upcoming.openMs)) {
      upcoming = round;
    }
  }

  return {
    open,
    last,
    upcoming,
    currentNumber: open?.number ?? roundNumber(startTimeUnix, today, timeZone),
  };
}
