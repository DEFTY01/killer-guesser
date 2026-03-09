import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ── Hoist mocks ──────────────────────────────────────────────────
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

describe("admin-login-flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("on 200 → router.push('/admin/dashboard') called", async () => {
    mockSignIn.mockResolvedValue({ error: null });

    // Render /admin/login
    render(<AdminLoginPage />);

    // Type password
    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "correctpassword" } });

    // Click submit
    const form = passwordInput.closest("form")!;
    fireEvent.submit(form);

    // On 200 → redirect to dashboard
    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith("admin", {
        password: "correctpassword",
        redirect: false,
      });
    });

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith("/admin/dashboard");
    });
  });

  it("on 401 → error message visible, no navigation", async () => {
    mockSignIn.mockResolvedValue({ error: "CredentialsSignin" });

    render(<AdminLoginPage />);

    const passwordInput = screen.getByLabelText("Password");
    fireEvent.change(passwordInput, { target: { value: "wrongpassword" } });

    const form = passwordInput.closest("form")!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Invalid password");
    });

    expect(mockPush).not.toHaveBeenCalled();
  });
});
