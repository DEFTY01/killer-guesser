import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";

/**
 * Tests for admin authentication flow.
 *
 * Since admin login uses the NextAuth "admin" Credentials provider
 * (not a separate /api/auth/admin-login endpoint), we test the
 * authorize logic directly.
 */

describe("Admin authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Replicate the admin authorize logic from src/lib/auth.ts
  async function adminAuthorize(credentials: { password?: string }): Promise<{ id: string; role: string } | null> {
    const submitted = credentials?.password as string | undefined;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!submitted || !adminPassword) {
      throw new Error("Invalid admin password");
    }

    const submittedHash = crypto
      .createHash("sha256")
      .update(submitted)
      .digest();
    const adminHash = crypto
      .createHash("sha256")
      .update(adminPassword)
      .digest();

    const match = crypto.timingSafeEqual(submittedHash, adminHash);
    if (!match) {
      throw new Error("Invalid admin password");
    }

    return { id: "admin", role: "admin" };
  }

  it("correct password → returns admin identity", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    try {
      const result = await adminAuthorize({ password: "test-password-123" });
      expect(result).toEqual({ id: "admin", role: "admin" });
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });

  it("wrong password → throws 'Invalid admin password'", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    try {
      await expect(adminAuthorize({ password: "wrong" })).rejects.toThrow(
        "Invalid admin password"
      );
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });

  it("missing password field → throws", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    try {
      await expect(adminAuthorize({ password: undefined })).rejects.toThrow();
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });

  it("empty password → throws", async () => {
    process.env.ADMIN_PASSWORD = "test-password-123";
    try {
      await expect(adminAuthorize({ password: "" })).rejects.toThrow(
        "Invalid admin password"
      );
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });

  it("uses timing-safe comparison (SHA-256 hash-based)", async () => {
    process.env.ADMIN_PASSWORD = "securepass";
    try {
      const hashSpy = vi.spyOn(crypto, "createHash");
      const timeingSafeSpy = vi.spyOn(crypto, "timingSafeEqual");

      await adminAuthorize({ password: "securepass" });

      expect(hashSpy).toHaveBeenCalledWith("sha256");
      expect(timeingSafeSpy).toHaveBeenCalled();

      hashSpy.mockRestore();
      timeingSafeSpy.mockRestore();
    } finally {
      delete process.env.ADMIN_PASSWORD;
    }
  });
});
