import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Hoist mock functions ──────────────────────────────────────────
const { mockSignIn, mockPush, mockRefresh } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockPush: vi.fn(),
  mockRefresh: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: mockRefresh,
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import LoginScreen from "@/components/auth/LoginScreen";

const mockPlayers = [
  { id: "1", nickname: "Alice", avatarUrl: "/alice.png" },
  { id: "2", nickname: "Bob", avatarUrl: null },
  { id: "3", nickname: "Charlie", avatarUrl: "/charlie.png" },
];

describe("LoginScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 'Play Now' button on mount", () => {
    render(<LoginScreen players={mockPlayers} />);
    expect(screen.getByText("Play Now")).toBeInTheDocument();
  });

  it("'Play Now' click opens avatar picker panel (panel becomes visible)", () => {
    render(<LoginScreen players={mockPlayers} />);

    const playNow = screen.getByText("Play Now");
    fireEvent.click(playNow);

    // The dialog panel should now be visible
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(dialog.className).toContain("panel-open");
  });

  it("clicking backdrop closes panel without logging in", () => {
    render(<LoginScreen players={mockPlayers} />);

    // Open the panel
    fireEvent.click(screen.getByText("Play Now"));
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("panel-open");

    // Click the backdrop (the element with login-backdrop class)
    const backdrop = document.querySelector(".login-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    // Panel should close
    expect(dialog.className).not.toContain("panel-open");
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("selecting an avatar card enables the Sign In button", () => {
    render(<LoginScreen players={mockPlayers} />);
    fireEvent.click(screen.getByText("Play Now"));

    const signInBtn = screen.getByText("Sign In").closest("button")!;
    expect(signInBtn).toBeDisabled();

    // Click a player card
    const aliceCard = screen.getByLabelText("Select Alice");
    fireEvent.click(aliceCard);

    expect(signInBtn).not.toBeDisabled();
  });

  it("selecting a different card deselects the previous one", () => {
    render(<LoginScreen players={mockPlayers} />);
    fireEvent.click(screen.getByText("Play Now"));

    const aliceCard = screen.getByLabelText("Select Alice");
    const bobCard = screen.getByLabelText("Select Bob");

    fireEvent.click(aliceCard);
    expect(aliceCard).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(bobCard);
    expect(bobCard).toHaveAttribute("aria-pressed", "true");
    expect(aliceCard).toHaveAttribute("aria-pressed", "false");
  });

  it("Sign In button shows spinner while signIn is pending", async () => {
    // Make signIn hang indefinitely
    mockSignIn.mockReturnValue(new Promise(() => {}));

    render(<LoginScreen players={mockPlayers} />);
    fireEvent.click(screen.getByText("Play Now"));

    // Select a player
    fireEvent.click(screen.getByLabelText("Select Alice"));

    // Click sign in
    const signInBtn = screen.getByText("Sign In").closest("button")!;
    fireEvent.click(signInBtn);

    // Button should show loading state
    await waitFor(() => {
      expect(screen.getByText("Signing in…")).toBeInTheDocument();
    });
  });

  it("on signIn error, inline error appears inside panel, panel stays open", async () => {
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });

    render(<LoginScreen players={mockPlayers} />);
    fireEvent.click(screen.getByText("Play Now"));

    fireEvent.click(screen.getByLabelText("Select Alice"));

    const signInBtn = screen.getByText("Sign In").closest("button")!;
    fireEvent.click(signInBtn);

    await waitFor(() => {
      const alert = screen.getByRole("alert");
      expect(alert).toBeInTheDocument();
      expect(alert.textContent).toContain("Sign in failed");
    });

    // Panel should still be open
    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("panel-open");
  });
});
