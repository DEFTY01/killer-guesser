import { describe, it, expect } from "vitest";
import { isKiller } from "@/lib/roleUtils";

describe("isKiller", () => {
  it("returns true when playerId matches killerId", () => {
    expect(isKiller(42, 42)).toBe(true);
  });

  it("returns false when playerId does not match killerId", () => {
    expect(isKiller(42, 99)).toBe(false);
  });

  it("returns false when killerId is undefined", () => {
    expect(isKiller(42, undefined)).toBe(false);
  });

  it("returns false when killerId is undefined even for zero id", () => {
    expect(isKiller(0, undefined)).toBe(false);
  });

  it("returns true when both ids are zero", () => {
    expect(isKiller(0, 0)).toBe(true);
  });
});
