import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Hoist mocks ──────────────────────────────────────────────────
const { mockSignIn, mockPush } = vi.hoisted(() => ({
  mockSignIn: vi.fn(),
  mockPush: vi.fn(),
}));

vi.mock("next-auth/react", () => ({
  signIn: mockSignIn,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

import LoginScreen from "@/components/auth/LoginScreen";

const seededPlayers = [
  { id: "1", nickname: "Alice", avatarUrl: "/alice.png" },
  { id: "2", nickname: "Bob", avatarUrl: "/bob.png" },
  { id: "3", nickname: "Charlie", avatarUrl: null },
];

describe("player-login-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("full login flow: Play Now → select player → Sign In → redirects to /lobby", async () => {
    mockSignIn.mockResolvedValue({ ok: true });

    // Step 1: Render /login page with seeded players
    render(<LoginScreen players={seededPlayers} />);

    // Step 2: Click "Play Now" → panel opens
    const playNow = screen.getByText("Play Now");
    expect(playNow).toBeInTheDocument();
    fireEvent.click(playNow);

    const dialog = screen.getByRole("dialog");
    expect(dialog.className).toContain("panel-open");

    // Step 3: Click a player card → Sign In button enables
    const aliceCard = screen.getByLabelText("Select Alice");
    fireEvent.click(aliceCard);

    const signInBtn = screen.getByText("Sign In").closest("button")!;
    expect(signInBtn).not.toBeDisabled();

    // Step 4: Click Sign In → signIn("player") called with correct userId
    fireEvent.click(signInBtn);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("player", {
        userId: "1",
        redirect: false,
      });
    });

    // Step 5: On mock success → router.push("/lobby") called
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/lobby");
    });
  });
});
