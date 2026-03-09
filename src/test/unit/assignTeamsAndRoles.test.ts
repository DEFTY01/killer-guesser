import { describe, it, expect } from "vitest";
import {
  fisherYatesShuffle,
  weightedRandomSelect,
  assignTeamsAndRoles,
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
    const entries: RoleEntry[] = [{ roleId: 1, chancePercent: 50 }];
    expect(weightedRandomSelect(entries, 0)).toEqual([]);
  });

  it("returns at most count items", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 50 },
      { roleId: 2, chancePercent: 30 },
      { roleId: 3, chancePercent: 20 },
    ];
    const result = weightedRandomSelect(entries, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it("never returns more items than the pool size", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 50 },
    ];
    const result = weightedRandomSelect(entries, 5);
    expect(result.length).toBeLessThanOrEqual(1);
  });

  it("returns items from the pool", () => {
    const entries: RoleEntry[] = [
      { roleId: 1, chancePercent: 100 },
      { roleId: 2, chancePercent: 100 },
    ];
    const result = weightedRandomSelect(entries, 2);
    const ids = result.map((r) => r.roleId);
    expect(ids).toContain(1);
    expect(ids).toContain(2);
  });
});

describe("assignTeamsAndRoles", () => {
  const baseInput: AssignmentInput = {
    playerIds: [1, 2, 3, 4, 5, 6],
    team1MaxPlayers: 2,
    team2MaxPlayers: 4,
    team1Roles: [
      { roleId: 10, chancePercent: 100 }, // Killer
      { roleId: 11, chancePercent: 50 },  // Some other evil role
    ],
    team1SpecialCount: 0,
    killerRoleId: 10,
    team2Roles: [
      { roleId: 20, chancePercent: 50 },
      { roleId: 21, chancePercent: 50 },
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

  it("respects team1 max players cap", () => {
    const result = assignTeamsAndRoles(baseInput);
    const team1Count = result.filter((r) => r.team === "team1").length;
    expect(team1Count).toBeLessThanOrEqual(baseInput.team1MaxPlayers);
  });

  it("assigns exactly one Killer in team1", () => {
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

  it("assigns Survivor to remaining team2 players", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team2SpecialCount: 0,
    };
    const result = assignTeamsAndRoles(input);
    const team2 = result.filter((r) => r.team === "team2");
    // All team2 players should have the survivor role
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

  it("handles team1SpecialCount > 0", () => {
    const input: AssignmentInput = {
      ...baseInput,
      team1MaxPlayers: 3,
      team1SpecialCount: 1,
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
});
