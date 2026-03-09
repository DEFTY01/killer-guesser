import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mock next/image ───────────────────────────────────────────────
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

vi.mock("@/lib/role-constants", () => ({
  DEFAULT_ROLE_COLOR: "#2E6DA4",
}));

import { PlayerCard, type PlayerCardPlayer } from "@/components/game/PlayerCard";

function makePlayer(overrides: Partial<PlayerCardPlayer> = {}): PlayerCardPlayer {
  return {
    id: 1,
    user_id: 100,
    name: "TestPlayer",
    avatar_url: null,
    team: "team1",
    is_dead: 0,
    is_revived: 0,
    revived_at: null,
    role_color: "#2E6DA4",
    ...overrides,
  };
}

describe("PlayerCard", () => {
  it("dead player renders with grayscale class and X overlay", () => {
    const player = makePlayer({ is_dead: 1 });
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
      />
    );

    // Avatar should have grayscale class
    const avatar = container.querySelector(".grayscale");
    expect(avatar).not.toBeNull();

    // X overlay should be visible (red bars)
    const xOverlay = container.querySelector("[aria-hidden='true']");
    expect(xOverlay).not.toBeNull();
  });

  it("revived player renders without X, with 'Undead' label", () => {
    const player = makePlayer({ is_dead: 0, is_revived: 1, revived_at: 1700000000 });
    render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
      />
    );

    expect(screen.getByText("Undead")).toBeInTheDocument();
  });

  it("re-dead undead player (is_dead=1, is_revived=1) has no 'Undead' label", () => {
    const player = makePlayer({ is_dead: 1, is_revived: 1, revived_at: 1700000000 });
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
      />
    );

    expect(screen.queryByText("Undead")).not.toBeInTheDocument();
    // Should show X overlay (dead, not undead)
    const xOverlay = container.querySelector("[aria-hidden='true']");
    expect(xOverlay).not.toBeNull();
  });

  it("Seer view + killerId match → red border class + 'Killer' label", () => {
    const player = makePlayer();
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={true}
        canRevive={false}
      />
    );

    expect(screen.getByText("Killer")).toBeInTheDocument();
    // The card should have a red border
    const card = container.firstChild as HTMLElement;
    expect(card.style.border).toContain("rgb(192, 57, 43)");
  });

  it("Seer view + no killerId match → no red border", () => {
    const player = makePlayer();
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
      />
    );

    expect(screen.queryByText("Killer")).not.toBeInTheDocument();
    const card = container.firstChild as HTMLElement;
    expect(card.style.border).not.toContain("rgb(192, 57, 43)");
  });

  it("Healer view + dead player → 'Revive' button visible", () => {
    const player = makePlayer({ is_dead: 1 });
    render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={true}
      />
    );

    expect(screen.getByText("Revive")).toBeInTheDocument();
  });

  it("Mayor view → no role border, no team badge, only avatar and name", () => {
    const player = makePlayer({ team: undefined, role_color: undefined });
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
        viewerRole="Mayor"
      />
    );

    // Player name should be rendered
    expect(screen.getByText("TestPlayer")).toBeInTheDocument();
    // No team badge
    expect(screen.queryByText("Team 1")).not.toBeInTheDocument();
    expect(screen.queryByText("Team 2")).not.toBeInTheDocument();
    // Card should not have role-color border (Mayor view renders a flat card)
    const card = container.firstChild as HTMLElement;
    expect(card.style.border).toBeFalsy();
  });

  it("Mayor view + undead player shows 'Undead' badge", () => {
    const player = makePlayer({ is_dead: 0, is_revived: 1, revived_at: 1700000000, team: undefined, role_color: undefined });
    render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
        viewerRole="Mayor"
      />
    );

    expect(screen.getByText("Undead")).toBeInTheDocument();
  });

  it("default view → border color matches player's role color", () => {
    const player = makePlayer({ role_color: "#FF5733" });
    const { container } = render(
      <PlayerCard
        player={player}
        isOwnCard={false}
        isKiller={false}
        canRevive={false}
        showRoleBorder={true}
      />
    );

    const card = container.firstChild as HTMLElement;
    expect(card.style.border).toContain("rgb(255, 87, 51)");
  });
});
