import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RoleRevealModal } from "@/components/game/RoleRevealModal";

describe("RoleRevealModal", () => {
  it("renders the mystery card (front face) initially", () => {
    const onClose = vi.fn();
    render(
      <RoleRevealModal
        roleName="Killer"
        roleColor="#c0392b"
        roleDescription="Eliminate the others."
        teamName="Evil"
        onClose={onClose}
      />,
    );

    expect(screen.getByText("Your role is…")).toBeInTheDocument();
    expect(screen.getByText("Tap to reveal")).toBeInTheDocument();
    // "Got it!" button should not be visible yet
    expect(screen.queryByRole("button", { name: /got it/i })).toBeNull();
  });

  it("has a button with accessible label 'Tap to reveal your role' before flip", () => {
    render(
      <RoleRevealModal
        roleName="Seer"
        roleColor="#6c3483"
        roleDescription="You see the killer."
        teamName="Good"
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("button", { name: /tap to reveal your role/i }),
    ).toBeInTheDocument();
  });

  it("flipping the card shows role name, team, and description", () => {
    render(
      <RoleRevealModal
        roleName="Seer"
        roleColor="#6c3483"
        roleDescription="You can see who the killer is."
        teamName="Good"
        onClose={vi.fn()}
      />,
    );

    const flipButton = screen.getByRole("button", { name: /tap to reveal your role/i });
    fireEvent.click(flipButton);

    expect(screen.getByText("Seer")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
    expect(screen.getByText("You can see who the killer is.")).toBeInTheDocument();
  });

  it("shows 'Got it!' button after flipping", () => {
    render(
      <RoleRevealModal
        roleName="Killer"
        roleColor="#c0392b"
        roleDescription={null}
        teamName={null}
        onClose={vi.fn()}
      />,
    );

    const flipButton = screen.getByRole("button", { name: /tap to reveal your role/i });
    fireEvent.click(flipButton);

    expect(
      screen.getByRole("button", { name: /got it/i }),
    ).toBeInTheDocument();
  });

  it("calls onClose when 'Got it!' is clicked", () => {
    const onClose = vi.fn();
    render(
      <RoleRevealModal
        roleName="Healer"
        roleColor="#27ae60"
        roleDescription={null}
        teamName="Good"
        onClose={onClose}
      />,
    );

    const flipButton = screen.getByRole("button", { name: /tap to reveal your role/i });
    fireEvent.click(flipButton);

    const gotItButton = screen.getByRole("button", { name: /got it/i });
    fireEvent.click(gotItButton);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows 'Unknown' when roleName is null", () => {
    render(
      <RoleRevealModal
        roleName={null}
        roleColor={null}
        roleDescription={null}
        teamName={null}
        onClose={vi.fn()}
      />,
    );

    const flipButton = screen.getByRole("button", { name: /tap to reveal your role/i });
    fireEvent.click(flipButton);

    expect(screen.getByText("Unknown")).toBeInTheDocument();
  });

  it("does not show team badge when teamName is null", () => {
    render(
      <RoleRevealModal
        roleName="Killer"
        roleColor="#c0392b"
        roleDescription={null}
        teamName={null}
        onClose={vi.fn()}
      />,
    );

    const flipButton = screen.getByRole("button", { name: /tap to reveal your role/i });
    fireEvent.click(flipButton);

    // Only the role name should be visible, no team badge
    expect(screen.queryByText("Good")).toBeNull();
    expect(screen.queryByText("Evil")).toBeNull();
  });

  it("is a dialog with aria-modal attribute", () => {
    render(
      <RoleRevealModal
        roleName="Mayor"
        roleColor="#f39c12"
        roleDescription={null}
        teamName="Good"
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
  });
});
