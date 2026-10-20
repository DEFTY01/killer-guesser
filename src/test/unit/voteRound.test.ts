import { describe, it, expect } from "vitest";
import {
  addDays,
  localDate,
  resolveRoundState,
  roundNumber,
  zonedTimeToUtcMs,
} from "@/lib/voteRound";

const TZ = "Europe/Budapest"; // UTC+1 winter, UTC+2 summer
const utc = (iso: string) => Date.parse(iso);
const evening = () => ({ start: "18:00", end: "20:00" });
const overnight = () => ({ start: "22:00", end: "02:00" });

describe("zonedTimeToUtcMs", () => {
  it("applies the winter offset", () => {
    expect(zonedTimeToUtcMs("2026-01-15", "18:00", TZ)).toBe(utc("2026-01-15T17:00:00Z"));
  });

  it("applies the summer offset", () => {
    expect(zonedTimeToUtcMs("2026-07-15", "18:00", TZ)).toBe(utc("2026-07-15T16:00:00Z"));
  });

  it("is correct on the spring-forward day after the change", () => {
    // Budapest switches 2026-03-29 02:00 → 03:00; 18:00 is already UTC+2.
    expect(zonedTimeToUtcMs("2026-03-29", "18:00", TZ)).toBe(utc("2026-03-29T16:00:00Z"));
  });
});

describe("date helpers", () => {
  it("local date follows the zone, not UTC", () => {
    expect(localDate(utc("2026-01-15T23:30:00Z"), TZ)).toBe("2026-01-16");
  });

  it("addDays crosses month ends", () => {
    expect(addDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("round numbers count local days from the start date", () => {
    const start = utc("2026-01-15T10:00:00Z") / 1000;
    expect(roundNumber(start, "2026-01-15", TZ)).toBe(1);
    expect(roundNumber(start, "2026-01-17", TZ)).toBe(3);
  });
});

describe("resolveRoundState", () => {
  const start = utc("2026-01-15T10:00:00Z") / 1000;
  const state = (nowIso: string, windowFor: (date: string) => { start: string; end: string } | null = evening) =>
    resolveRoundState({ nowMs: utc(nowIso), startTimeUnix: start, timeZone: TZ, windowFor });

  it("before the window: nothing open, previous day's round is the last", () => {
    const s = state("2026-01-16T10:00:00Z");
    expect(s.open).toBeNull();
    expect(s.last?.number).toBe(1);
    expect(s.currentNumber).toBe(2);
  });

  it("inside the window: open round, previous day closed", () => {
    const s = state("2026-01-16T17:30:00Z"); // 18:30 local
    expect(s.open?.number).toBe(2);
    expect(s.last?.number).toBe(1);
  });

  it("after the window: that round is the last one", () => {
    const s = state("2026-01-16T19:30:00Z"); // 20:30 local
    expect(s.open).toBeNull();
    expect(s.last?.number).toBe(2);
  });

  it("overnight window: morning before opening is NOT treated as ended-unopened", () => {
    const s = state("2026-01-16T09:00:00Z", overnight); // 10:00 local
    expect(s.open).toBeNull();
    // Round 1 (opened 22:00 on the 15th) ended at 02:00 on the 16th.
    expect(s.last?.number).toBe(1);
    // Nothing earlier than the start date exists, so no phantom round 0.
  });

  it("overnight window: 01:00 still belongs to the round that opened the evening before", () => {
    const s = state("2026-01-16T00:00:00Z", overnight); // 01:00 local on the 16th
    expect(s.open?.date).toBe("2026-01-15");
    expect(s.open?.number).toBe(1);
  });

  it("per-day override wins for its own date", () => {
    const windowFor = (date: string) =>
      date === "2026-01-16" ? { start: "20:30", end: "22:00" } : evening();
    const s = state("2026-01-16T19:30:00Z", windowFor); // 20:30 local
    expect(s.open?.number).toBe(2);
  });

  it("after today's window the next round is tomorrow's", () => {
    const s = state("2026-01-16T19:30:00Z");
    expect(s.upcoming?.date).toBe("2026-01-17");
    expect(s.upcoming?.number).toBe(3);
  });

  it("before today's window the upcoming round opens later today", () => {
    const s = state("2026-01-16T10:00:00Z");
    expect(s.upcoming?.date).toBe("2026-01-16");
  });

  it("no window configured: nothing open or closed", () => {
    const s = state("2026-01-16T17:30:00Z", () => null);
    expect(s.open).toBeNull();
    expect(s.last).toBeNull();
    expect(s.currentNumber).toBe(2);
  });

  it("malformed window is ignored instead of throwing", () => {
    const s = state("2026-01-16T17:30:00Z", () => ({ start: "99:99", end: "20:00" }));
    expect(s.open).toBeNull();
  });
});
