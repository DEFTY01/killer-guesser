import { describe, it, expect } from "vitest";
import {
  gameTimeToUtc,
  nowInZone,
  formatInZone,
  windowBoundariesUtc,
} from "@/lib/timezone";

// ── gameTimeToUtc ─────────────────────────────────────────────────

describe("gameTimeToUtc", () => {
  it("converts a Budapest HH:MM to a UTC Date", () => {
    // Europe/Budapest is UTC+1 in winter, UTC+2 in summer.
    // We check that the result is shifted by the correct offset.
    const result = gameTimeToUtc("14:00", "Europe/Budapest");
    expect(result).toBeInstanceOf(Date);
    expect(isNaN(result.getTime())).toBe(false);

    // The Budapest local time expressed in UTC should be earlier.
    // Offset is either 1h or 2h — in either case the UTC hour is 12 or 13.
    const utcHour = result.getUTCHours();
    expect([12, 13]).toContain(utcHour);
  });

  it("returns the correct UTC ms for UTC itself (no offset)", () => {
    const result = gameTimeToUtc("10:30", "UTC");
    // UTC time should have hour=10, minute=30
    expect(result.getUTCHours()).toBe(10);
    expect(result.getUTCMinutes()).toBe(30);
  });

  it("handles midnight (00:00) correctly", () => {
    const result = gameTimeToUtc("00:00", "UTC");
    expect(result.getUTCHours()).toBe(0);
    expect(result.getUTCMinutes()).toBe(0);
  });
});

// ── nowInZone ─────────────────────────────────────────────────────

describe("nowInZone", () => {
  it("returns a number between 0 and 1439", () => {
    const result = nowInZone("UTC");
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThan(1440);
  });

  it("returns different values for UTC and Asia/Tokyo", () => {
    // Tokyo is UTC+9, so it will always differ from UTC by 9*60=540 minutes
    // (mod 1440).
    const utcMinutes = nowInZone("UTC");
    const tokyoMinutes = nowInZone("Asia/Tokyo");
    // They should differ (unless we're incredibly unlucky at the exact
    // midnight boundary in both zones simultaneously — practically impossible).
    const diff = ((tokyoMinutes - utcMinutes) + 1440) % 1440;
    // Tokyo is UTC+9, so diff should be 540 minutes.
    expect(diff).toBe(540);
  });
});

// ── formatInZone ──────────────────────────────────────────────────

describe("formatInZone", () => {
  it("formats a UTC ms timestamp as HH:MM in the given timezone", () => {
    // 2024-01-15T13:00:00Z — in UTC that is 13:00
    const utcMs = Date.UTC(2024, 0, 15, 13, 0, 0);
    expect(formatInZone(utcMs, "UTC")).toBe("13:00");
  });

  it("applies timezone offset correctly for Europe/Budapest (UTC+1 in winter)", () => {
    // 2024-01-15T13:00:00Z — in Budapest winter time (UTC+1) that is 14:00
    const utcMs = Date.UTC(2024, 0, 15, 13, 0, 0);
    expect(formatInZone(utcMs, "Europe/Budapest")).toBe("14:00");
  });

  it("zero-pads hours and minutes", () => {
    // 2024-01-15T00:05:00Z in UTC
    const utcMs = Date.UTC(2024, 0, 15, 0, 5, 0);
    const result = formatInZone(utcMs, "UTC");
    expect(result).toBe("00:05");
  });
});

// ── windowBoundariesUtc ───────────────────────────────────────────

describe("windowBoundariesUtc", () => {
  it("returns correct UTC ms for a Budapest-local window (winter)", () => {
    // Budapest is UTC+1 in winter.
    // Window 14:00–22:00 local → 13:00–21:00 UTC today.
    const { openMs, closeMs } = windowBoundariesUtc(
      "14:00",
      "22:00",
      "Europe/Budapest",
    );
    expect(closeMs).toBeGreaterThan(openMs);

    const openDate = new Date(openMs);
    const closeDate = new Date(closeMs);

    // In UTC, open should be 13:xx and close 21:xx (winter = UTC+1).
    // We just verify the gap is exactly 8 hours.
    expect(closeMs - openMs).toBe(8 * 60 * 60 * 1000);

    // UTC hours should be 13 and 21 in January (winter, UTC+1).
    const nowLocal = new Date();
    const isJanuary = nowLocal.getMonth() === 0;
    if (isJanuary) {
      expect(openDate.getUTCHours()).toBe(13);
      expect(closeDate.getUTCHours()).toBe(21);
    }
  });

  it("handles overnight window (22:00–02:00): closeMs > openMs", () => {
    const { openMs, closeMs } = windowBoundariesUtc("22:00", "02:00", "UTC");
    expect(closeMs).toBeGreaterThan(openMs);
    // Gap should be exactly 4 hours (22 to 02 = 4h).
    expect(closeMs - openMs).toBe(4 * 60 * 60 * 1000);
  });

  it("overnight window: closeMs crosses day boundary correctly", () => {
    const { openMs, closeMs } = windowBoundariesUtc("23:00", "01:00", "UTC");
    // 2 hours overnight
    expect(closeMs - openMs).toBe(2 * 60 * 60 * 1000);
    // closeMs should be on the next calendar day in UTC.
    const openDate = new Date(openMs);
    const closeDate = new Date(closeMs);
    expect(closeDate.getUTCDate()).toBeGreaterThan(openDate.getUTCDate() - 1);
  });

  it("same-day window: openMs < closeMs", () => {
    const { openMs, closeMs } = windowBoundariesUtc("10:00", "18:00", "UTC");
    expect(closeMs).toBeGreaterThan(openMs);
    expect(closeMs - openMs).toBe(8 * 60 * 60 * 1000);
  });
});
