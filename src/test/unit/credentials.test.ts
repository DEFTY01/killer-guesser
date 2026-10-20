import { describe, it, expect } from "vitest";
import {
  generateJoinCode,
  normalizeJoinCode,
  generatePin,
  hashPin,
  verifyPin,
  JOIN_CODE_LENGTH,
  PIN_LENGTH,
} from "@/lib/credentials";

describe("credentials", () => {
  it("join code uses the unambiguous alphabet and fixed length", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateJoinCode()).toMatch(
        new RegExp(`^[A-HJKMNP-Z2-9]{${JOIN_CODE_LENGTH}}$`),
      );
    }
  });

  it("normalizes user input", () => {
    expect(normalizeJoinCode(" ab-c2 d3 ")).toBe("ABC2D3");
  });

  it("pin is numeric with leading zeros preserved", () => {
    for (let i = 0; i < 200; i++) {
      expect(generatePin()).toMatch(new RegExp(`^\\d{${PIN_LENGTH}}$`));
    }
  });

  it("hash verifies only the right pin and is salted", () => {
    const h1 = hashPin("0420");
    const h2 = hashPin("0420");
    expect(h1).not.toBe(h2);
    expect(verifyPin("0420", h1)).toBe(true);
    expect(verifyPin("0421", h1)).toBe(false);
    expect(verifyPin("0420", "garbage")).toBe(false);
  });
});
