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

import AdminLoginPage from "@/app/(admin-auth)/admin/login/page";

describe("AdminLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders single password input and submit button, no avatar grid", () => {
    render(<AdminLoginPage />);

    // Should have a password input
    const passwordInput = screen.getByLabelText("Password");
    expect(passwordInput).toBeInTheDocument();
    expect(passwordInput).toHaveAttribute("type", "password");

    // Should have a submit button
    expect(screen.getByText("Sign In")).toBeInTheDocument();

    // No avatar grid
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("on submit calls signIn('admin')", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    render(<AdminLoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "mypassword" } });

    const form = passwordInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("admin", {
        password: "mypassword",
        redirect: false,
      });
    });
  });

  it("on 200 response redirects to /admin/dashboard", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    render(<AdminLoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "correctpass" } });

    const form = passwordInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  it("on 401 shows 'Invalid password' inline", async () => {
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });

    render(<AdminLoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "wrongpass" } });

    const form = passwordInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid password");
    });

    // Should NOT navigate
    expect(mockPush).not.toHaveBeenCalled();
  });
});
