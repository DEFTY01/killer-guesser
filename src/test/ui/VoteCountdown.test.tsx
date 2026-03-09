import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { VoteCountdown } from "@/components/game/VoteCountdown";

describe("VoteCountdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders countdown when within vote window", () => {
    vi.useFakeTimers();
    // Set current time to 14:30 UTC
    vi.setSystemTime(new Date("2026-01-01T14:30:00Z"));

    render(
      <VoteCountdown
        voteWindowStart="2026-01-01T14:00:00Z"
        voteWindowEnd="2026-01-01T15:00:00Z"
      />
    );

    // Component should be visible with the timer role
    const timer = screen.getByRole("timer");
    expect(timer).toBeInTheDocument();
  });

  it("hidden when outside vote window", () => {
    vi.useFakeTimers();
    // Set current time to 10:00 UTC (before window)
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));

    const { container } = render(
      <VoteCountdown
        voteWindowStart="2026-01-01T14:00:00Z"
        voteWindowEnd="2026-01-01T15:00:00Z"
      />
    );

    // Component should not render anything
    expect(container.innerHTML).toBe("");
  });

  it("hidden when no vote window is set", () => {
    const { container } = render(
      <VoteCountdown voteWindowStart={null} voteWindowEnd={null} />
    );

    expect(container.innerHTML).toBe("");
  });
});
