import { describe, it, expect, vi } from "vitest";
import {
  fisherYatesShuffle,
  weightedRandomSelect,
  assignTeamsAndRoles,
  resolveKillerCap,
  type AssignmentInput,
  type RoleEntry,
} from "@/lib/assignTeamsAndRoles";

describe("fisherYatesShuffle", () => {
  it("returns an array of the same length", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle([...arr]);
    expect(result).toHaveLength(arr.length);
  });

  it("contains all original elements", () => {
    const arr = [1, 2, 3, 4, 5];
    const result = fisherYatesShuffle([...arr]);
    expect(result.sort()).toEqual(arr.sort());
  });

  it("handles empty array", () => {
    expect(fisherYatesShuffle([])).toEqual([]);
  });

  it("handles single element", () => {
    expect(fisherYatesShuffle([42])).toEqual([42]);
  });
});

describe("weightedRandomSelect", () => {
  it("returns empty array for empty pool", () => {
    expect(weightedRandomSelect([], 3)).toEqual([]);
  });

  it("returns empty array when count is 0", () => {
    const entries: RoleEntry[] = [{ roleId: 1, chancePercent: 50, isEvil: false }];
    expect(weightedRandomSelect(entries, 0)).toEqual([]);
  });

  it("returns at most count items", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 50, isEvil: false },
      { roleId: 2, chancePercent: 30, isEvil: false },
      { roleId: 3, chancePercent: 20, isEvil: false },
    ];
    const result = weightedRandomSelect(entries, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("never returns more items than the pool size", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 50, isEvil: false },
    ];
    const result = weightedRandomSelect(entries, 5);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("returns items from the pool", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 100, isEvil: false },
      { roleId: 2, chancePercent: 100, isEvil: false },
    ];
    const result = weightedRandomSelect(entries, 2);
    const ids = result.map((r) => r.roleId);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });
});

// ── resolveKillerCap ──────────────────────────────────────────────

describe("resolveKillerCap", () => {
  it("returns 1 for 4 players (< 6)", () => {
    expect(resolveKillerCap(4, 3)).toBe(1);
  });

  it("returns 1 for 6 players (>= 6)", () => {
    expect(resolveKillerCap(6, 5)).toBe(1);
  });

  it("returns max 2 for 9 players", () => {
    expect(resolveKillerCap(9, 5)).toBe(2);
  });

  it("returns max 3 for 15 players", () => {
    expect(resolveKillerCap(15, 5)).toBe(3);
  });

  it("returns max 3 for 20 players", () => {
    expect(resolveKillerCap(20, 10)).toBe(3);
  });

  it("adminCap is always capped to totalPlayers - 1", () => {
    // With 2 players, adminCap 2 → resolvedCap must be at most 1 (totalPlayers - 1)
    expect(resolveKillerCap(2, 2)).toBe(1);
  });

  it("adminCap capped to totalPlayers - 1 with large player count", () => {
    // For 9 players, player-count-based max is 2.
    // adminCap of 9 is reduced to 2 (player-count max), which is already ≤ totalPlayers-1 (8).
    expect(resolveKillerCap(9, 9)).toBe(2);
  });

  it("emits console.warn when adminCap is overridden", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveKillerCap(6, 5); // adminCap 5 > resolved 1
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not warn when adminCap equals resolved cap", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    resolveKillerCap(6, 1); // adminCap 1 == resolved 1
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

// ── assignTeamsAndRoles ───────────────────────────────────────────

describe("assignTeamsAndRoles", () => {
  // team1 = Evil (isEvilTeam1: true), team2 = Good
  // With 6 players and team1MaxPlayers=2: resolveKillerCap(6, 2) = 1
  const baseInput: AssignmentInput = {
    playerIds: [1, 2, 3, 4, 5, 6],
    team1MaxPlayers: 2,
    team2MaxPlayers: 4,
    isEvilTeam1: true,
    team1Roles: [
      { roleId: 10, chancePercent: 100, isEvil: true },  // Killer
      { roleId: 11, chancePercent: 50, isEvil: true },   // Some other evil role
    ],
    team1SpecialCount: 0,
    killerRoleId: 10,
    team2Roles: [
      { roleId: 20, chancePercent: 50, isEvil: false },
      { roleId: 21, chancePercent: 50, isEvil: false },
    ],
    team2SpecialCount: 1,
    survivorRoleId: 30,
  };

  it("assigns all players", () => {
    const result = assignTeamsAndRoles(baseInput);
    expect(result).toHaveLength(6);
    const userIds = result.map((r) => r.userId).sort();
    expect(userIds).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("respects team1 max players cap (capped by resolveKillerCap)", () => {
    const result = assignTeamsAndRoles(baseInput);
    const team1Count = result.filter((r) => r.team === "team1").length;
    // resolveKillerCap(6, 2) = 1 because max for 6 players is 1
    expect(team1Count).toBeLessThanOrEqual(baseInput.team1MaxPlayers);
  });

  it("assigns exactly one Killer in the Evil team (team1)", () => {
    const result = assignTeamsAndRoles(baseInput);
    const killers = result.filter(
      (r) => r.team === "team1" && r.roleId === 10,
    );
    expect(killers).toHaveLength(1);
  });

  it("never assigns Killer to team2", () => {
    const result = assignTeamsAndRoles(baseInput);
    const team2Killers = result.filter(
      (r) => r.team === "team2" && r.roleId === 10,
    );
    expect(team2Killers).toHaveLength(0);
  });

  it("assigns Survivor to remaining team2 players when specialCount=0", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team2SpecialCount: 0,
    };
    const result = assignTeamsAndRoles(input);
    const team2 = result.filter((r) => r.team === "team2");
    // All team2 (Good) players should have the survivor role
    for (const p of team2) {
      expect(p.roleId).toBe(30);
    }
  });

  it("handles single player", () => {
    const input: AssignmentInput = {
      ...baseInput,
      playerIds: [1],
      team1MaxPlayers: 1,
      team2MaxPlayers: 1,
    };
    const result = assignTeamsAndRoles(input);
    expect(result).toHaveLength(1);
    expect(result[0].team).toBe("team1");
    expect(result[0].roleId).toBe(10); // Killer
  });

  it("handles team1SpecialCount > 0 with enough players for cap", () => {
    // Use 15 players so resolveKillerCap allows 3
    const players = Array.from({ length: 15 }, (_, i) => i + 1);
    const input: AssignmentInput = {
      ...baseInput,
      playerIds: players,
      team1MaxPlayers: 3,
      team1SpecialCount: 1,
      team1Roles: [
        { roleId: 10, chancePercent: 100, isEvil: true }, // Killer
        { roleId: 11, chancePercent: 50, isEvil: true },  // extra evil role
        { roleId: 12, chancePercent: 50, isEvil: true },  // extra evil role
      ],
    };
    const result = assignTeamsAndRoles(input);
    const team1 = result.filter((r) => r.team === "team1");
    expect(team1).toHaveLength(3);
    // One should be the Killer
    const killers = team1.filter((p) => p.roleId === 10);
    expect(killers).toHaveLength(1);
  });

  it("handles empty playerIds", () => {
    const input: AssignmentInput = {
      ...baseInput,
      playerIds: [],
    };
    const result = assignTeamsAndRoles(input);
    expect(result).toHaveLength(0);
  });

  // ── Evil team never exceeds resolved cap ────────────────────────

  it("Evil team never exceeds resolved Killer cap", () => {
    // 9 players, admin requests 5 evil → resolveKillerCap(9, 5) = 2
    const players = Array.from({ length: 9 }, (_, i) => i + 1);
    const input: AssignmentInput = {
      ...baseInput,
      playerIds: players,
      team1MaxPlayers: 5, // will be capped to 2
      team1Roles: [
        { roleId: 10, chancePercent: 100, isEvil: true },
        { roleId: 11, chancePercent: 50, isEvil: true },
      ],
    };
    const result = assignTeamsAndRoles(input);
    const evilCount = result.filter((r) => r.team === "team1").length;
    expect(evilCount).toBeLessThanOrEqual(2);
  });

  // ── Good team never gets is_evil=1 role ─────────────────────────

  it("Good team never gets an is_evil role", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team2Roles: [
        { roleId: 20, chancePercent: 50, isEvil: false },
        { roleId: 99, chancePercent: 50, isEvil: true }, // should be filtered out
      ],
      team2SpecialCount: 2,
    };
    const result = assignTeamsAndRoles(input);
    const goodTeamPlayers = result.filter((r) => r.team === "team2");
    for (const p of goodTeamPlayers) {
      expect(p.roleId).not.toBe(99);
    }
  });

  // ── throws on insufficient evil roles ───────────────────────────

  it("throws when there are not enough Evil roles to fill the Evil team", () => {
    // 15 players, adminCap = 3 → resolveKillerCap(15, 3) = 3
    // but only 2 is_evil roles → throws
    const players = Array.from({ length: 15 }, (_, i) => i + 1);
    const input: AssignmentInput = {
      ...baseInput,
      playerIds: players,
      team1MaxPlayers: 3,
      team1Roles: [
        { roleId: 10, chancePercent: 100, isEvil: true }, // Killer
        { roleId: 11, chancePercent: 50, isEvil: true },  // one more
        // only 2 evil roles but need 3
      ],
    };
    expect(() => assignTeamsAndRoles(input)).toThrow(
      "Not enough Evil roles to fill the Evil team. Add more Evil roles or reduce the Evil team cap.",
    );
  });

  // ── throws if killerRoleId on Good team ─────────────────────────

  it("throws if killerRoleId is in the Good team roles", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team2Roles: [
        { roleId: 10, chancePercent: 100, isEvil: false }, // Killer on good team!
        { roleId: 20, chancePercent: 50, isEvil: false },
      ],
    };
    expect(() => assignTeamsAndRoles(input)).toThrow(
      "Killer role cannot be assigned to the Good team.",
    );
  });

  it("throws if killerRoleId is absent from Evil team roles", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team1Roles: [
        { roleId: 11, chancePercent: 50, isEvil: true }, // No Killer!
      ],
    };
    expect(() => assignTeamsAndRoles(input)).toThrow(
      "Killer role must be in the Evil team.",
    );
  });

  it("throws when evil team cap < 1", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team1MaxPlayers: 0,
    };
    expect(() => assignTeamsAndRoles(input)).toThrow(
      "Evil team must have at least 1 player.",
    );
  });

  // ── isEvilTeam1 = false: team2 is the Evil team ─────────────────

  it("correctly assigns Evil to team2 when isEvilTeam1 = false", () => {
    const input: AssignmentInput = {
      playerIds: [1, 2, 3, 4, 5, 6],
      team1MaxPlayers: 4,
      team2MaxPlayers: 2,
      isEvilTeam1: false, // team2 is Evil
      team1Roles: [
        { roleId: 20, chancePercent: 50, isEvil: false },
        { roleId: 21, chancePercent: 50, isEvil: false },
      ],
      team1SpecialCount: 0,
      killerRoleId: 10,
      team2Roles: [
        { roleId: 10, chancePercent: 100, isEvil: true }, // Killer in team2
        { roleId: 11, chancePercent: 50, isEvil: true },
      ],
      team2SpecialCount: 0,
      survivorRoleId: 30,
    };
    const result = assignTeamsAndRoles(input);
    // Killer should be in team2
    const killers = result.filter((r) => r.roleId === 10);
    expect(killers).toHaveLength(1);
    expect(killers[0].team).toBe("team2");
    // team1 (Good) should never have Killer
    const team1Killers = result.filter((r) => r.team === "team1" && r.roleId === 10);
    expect(team1Killers).toHaveLength(0);
  });
});
