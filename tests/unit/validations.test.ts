import { describe, it, expect } from "vitest";
import {
  adminLoginSchema,
  adminLoginPasswordSchema,
  playerRegisterSchema,
  avatarUploadSchema,
  createGameSchema,
} from "@/lib/validations";

describe("adminLoginSchema", () => {
  it("accepts valid credentials", () => {
    const result = adminLoginSchema.safeParse({
      email: "admin@example.com",
      password: "supersecret",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid email", () => {
    const result = adminLoginSchema.safeParse({
      email: "not-an-email",
      password: "supersecret",
    });
    expect(result.success).toBe(false);
  });

  it("rejects short password", () => {
    const result = adminLoginSchema.safeParse({
      email: "admin@example.com",
      password: "short",
    });
    expect(result.success).toBe(false);
  });
});

describe("adminLoginPasswordSchema", () => {
  it("accepts a non-empty password", () => {
    expect(adminLoginPasswordSchema.safeParse({ password: "anypassword" }).success).toBe(true);
  });

  it("accepts a single-character password", () => {
    expect(adminLoginPasswordSchema.safeParse({ password: "x" }).success).toBe(true);
  });

  it("rejects an empty password", () => {
    expect(adminLoginPasswordSchema.safeParse({ password: "" }).success).toBe(false);
  });

  it("rejects missing password field", () => {
    expect(adminLoginPasswordSchema.safeParse({}).success).toBe(false);
  });
});

describe("playerRegisterSchema", () => {
  it("accepts a valid nickname", () => {
    expect(playerRegisterSchema.safeParse({ nickname: "GhostRider99" }).success).toBe(true);
  });

  it("rejects a nickname that is too short", () => {
    expect(playerRegisterSchema.safeParse({ nickname: "A" }).success).toBe(false);
  });

  it("rejects a nickname that is too long", () => {
    expect(
      playerRegisterSchema.safeParse({ nickname: "A".repeat(25) }).success
    ).toBe(false);
  });

  it("rejects a nickname with special characters", () => {
    expect(playerRegisterSchema.safeParse({ nickname: "hello world!" }).success).toBe(false);
  });

  it("accepts underscores and hyphens", () => {
    expect(playerRegisterSchema.safeParse({ nickname: "the-ghost_99" }).success).toBe(true);
  });
});

describe("avatarUploadSchema", () => {
  it("accepts valid PNG under 5 MB", () => {
    expect(
      avatarUploadSchema.safeParse({ size: 1_000_000, type: "image/png" }).success
    ).toBe(true);
  });

  it("rejects files over 5 MB", () => {
    expect(
      avatarUploadSchema.safeParse({ size: 6_000_000, type: "image/jpeg" }).success
    ).toBe(false);
  });

  it("rejects unsupported MIME types", () => {
    expect(
      avatarUploadSchema.safeParse({ size: 1_000, type: "image/bmp" }).success
    ).toBe(false);
  });
});

describe("createGameSchema", () => {
  it("accepts a valid 6-character uppercase code", () => {
    expect(createGameSchema.safeParse({ code: "ABC123" }).success).toBe(true);
  });

  it("rejects a code that is too short", () => {
    expect(createGameSchema.safeParse({ code: "AB123" }).success).toBe(false);
  });

  it("rejects a code with lowercase letters", () => {
    expect(createGameSchema.safeParse({ code: "abc123" }).success).toBe(false);
  });
});
