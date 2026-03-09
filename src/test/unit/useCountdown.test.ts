import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useCountdown } from "@/hooks/useCountdown";

describe("useCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns correct hours/minutes/seconds for a future date", () => {
    vi.useFakeTimers();
    // Set "now" to a known time
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    // Target is 2 hours, 30 minutes, 45 seconds in the future
    const target = new Date("2026-01-01T02:30:45Z");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.hours).toBe(2);
    expect(result.current.minutes).toBe(30);
    expect(result.current.seconds).toBe(45);
  });

  it("isExpired=false when date is in the future", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const target = new Date("2026-01-01T01:00:00Z");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.isExpired).toBe(false);
  });

  it("isExpired=true when date is in the past", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T02:00:00Z");
    vi.setSystemTime(now);

    const target = new Date("2026-01-01T01:00:00Z");
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.isExpired).toBe(true);
    expect(result.current.hours).toBe(0);
    expect(result.current.minutes).toBe(0);
    expect(result.current.seconds).toBe(0);
  });

  it("cleans up interval on unmount", () => {
    vi.useFakeTimers();
    const clearIntervalSpy = vi.spyOn(global, "clearInterval");
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const target = new Date("2026-01-01T01:00:00Z");
    const { unmount } = renderHook(() => useCountdown(target));

    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });

  it("ticks down as time passes", () => {
    vi.useFakeTimers();
    const now = new Date("2026-01-01T00:00:00Z");
    vi.setSystemTime(now);

    const target = new Date("2026-01-01T00:00:10Z"); // 10 seconds ahead
    const { result } = renderHook(() => useCountdown(target));

    expect(result.current.seconds).toBe(10);

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(result.current.seconds).toBe(7);
  });
});
