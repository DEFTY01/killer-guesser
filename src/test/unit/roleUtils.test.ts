import { describe, it, expect } from "vitest";
import { isKiller } from "@/lib/roleUtils";

describe("isKiller", () => {
  it("isKiller(5, 5) → true", () => {
    expect(isKiller(5, 5)).toBe(true);
  });

  it("isKiller(5, 3) → false", () => {
    expect(isKiller(5, 3)).toBe(false);
  });

  it("isKiller(5, undefined) → false", () => {
    expect(isKiller(5, undefined)).toBe(false);
  });
});
