/**
 * Server-side team and role assignment for game creation.
 *
 * This module contains the logic for distributing players into teams
 * and assigning roles. The client never controls assignments — everything
 * is randomised on the server.
 *
 * @module assignTeamsAndRoles
 */

// ── Types ─────────────────────────────────────────────────────────

/** A role eligible for assignment in one team. */
export interface RoleEntry {
  roleId: number;
  chancePercent: number;
}

/** Input configuration for team and role assignment. */
export interface AssignmentInput {
  /** Array of user IDs to distribute across teams. */
  playerIds: number[];
  /** Maximum number of players allowed on team1. */
  team1MaxPlayers: number;
  /** Maximum number of players allowed on team2. */
  team2MaxPlayers: number;
  /** Roles eligible for team1 (must include the Killer). */
  team1Roles: RoleEntry[];
  /** How many special roles to assign on team1 (beyond the mandatory Killer). */
  team1SpecialCount: number;
  /** The role ID of the Killer role (must exist in team1Roles). */
  killerRoleId: number;
  /** Roles eligible for team2 (never includes Killer). */
  team2Roles: RoleEntry[];
  /** How many special roles to assign on team2 via weighted draw. */
  team2SpecialCount: number;
  /** The role ID of the default "Survivor" role for team2 players without a special role. */
  survivorRoleId: number | null;
}

/** Result for a single player after assignment. */
export interface PlayerAssignment {
  userId: number;
  team: "team1" | "team2";
  roleId: number | null;
}

// ── Fisher-Yates shuffle ──────────────────────────────────────────

/**
 * Shuffles an array in-place using the Fisher-Yates (Knuth) algorithm.
 * Produces a uniformly random permutation.
 *
 * @param arr - The array to shuffle (mutated in-place).
 * @returns The same array reference, now shuffled.
 */
export function fisherYatesShuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ── Weighted random selection ─────────────────────────────────────

/**
 * Selects `count` items from `entries` using weighted random sampling
 * (without replacement). Each entry's `chancePercent` acts as its weight.
 *
 * @param entries - The pool of role entries with weights.
 * @param count  - Number of entries to select.
 * @returns Selected role entries.
 */
export function weightedRandomSelect(
  entries: RoleEntry[],
  count: number,
): RoleEntry[] {
  if (entries.length === 0 || count <= 0) return [];
  const capped = Math.min(count, entries.length);

  const pool = [...entries];
  const selected: RoleEntry[] = [];

  for (let i = 0; i < capped; i++) {
    const totalWeight = pool.reduce((sum, e) => sum + e.chancePercent, 0);
    if (totalWeight <= 0) break;

    let rand = Math.random() * totalWeight;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      rand -= pool[idx].chancePercent;
      if (rand <= 0) break;
    }
    // Clamp to last valid index in case of floating-point rounding
    if (idx >= pool.length) idx = pool.length - 1;

    selected.push(pool[idx]);
    pool.splice(idx, 1);
  }

  return selected;
}

// ── Main assignment function ──────────────────────────────────────

/**
 * Assigns teams and roles to players server-side.
 *
 * **Algorithm:**
 * 1. Shuffle the player array using Fisher-Yates.
 * 2. Fill team1 with the first `team1MaxPlayers` players; the rest go to team2.
 * 3. Assign exactly one Killer role to a random team1 player.
 * 4. For team1, assign up to `team1SpecialCount` additional special roles
 *    (excluding the Killer) via weighted random selection.
 * 5. For team2, assign up to `team2SpecialCount` special roles via weighted
 *    random selection from `team2Roles`.
 * 6. Remaining team2 players receive the default Survivor role.
 *
 * @param input - The assignment configuration.
 * @returns An array of player assignments with team and role info.
 */
export function assignTeamsAndRoles(
  input: AssignmentInput,
): PlayerAssignment[] {
  const {
    playerIds,
    team1MaxPlayers,
    team1Roles,
    team1SpecialCount,
    killerRoleId,
    team2Roles,
    team2SpecialCount,
    survivorRoleId,
  } = input;

  // 1. Shuffle
  const shuffled = fisherYatesShuffle([...playerIds]);

  // 2. Distribute teams: fill team1 up to cap, rest go to team2
  const team1Count = Math.min(team1MaxPlayers, shuffled.length);
  const team1Players = shuffled.slice(0, team1Count);
  const team2Players = shuffled.slice(team1Count);

  const assignments: PlayerAssignment[] = [];

  // 3. Team1: assign exactly one Killer
  const team1Shuffled = fisherYatesShuffle([...team1Players]);
  const killerPlayerId = team1Shuffled[0];
  const remainingTeam1 = team1Shuffled.slice(1);

  if (killerPlayerId !== undefined) {
    assignments.push({
      userId: killerPlayerId,
      team: "team1",
      roleId: killerRoleId,
    });
  }

  // 4. Team1: assign additional special roles (exclude Killer from pool)
  const team1NonKillerRoles = team1Roles.filter(
    (r) => r.roleId !== killerRoleId,
  );
  const team1SpecialRoles = weightedRandomSelect(
    team1NonKillerRoles,
    Math.min(team1SpecialCount, remainingTeam1.length),
  );

  for (let i = 0; i < remainingTeam1.length; i++) {
    const specialRole = team1SpecialRoles[i];
    assignments.push({
      userId: remainingTeam1[i],
      team: "team1",
      roleId: specialRole ? specialRole.roleId : null,
    });
  }

  // 5. Team2: assign special roles via weighted draw
  const team2Shuffled = fisherYatesShuffle([...team2Players]);
  const team2SpecialRoles = weightedRandomSelect(
    team2Roles,
    Math.min(team2SpecialCount, team2Shuffled.length),
  );

  for (let i = 0; i < team2Shuffled.length; i++) {
    const specialRole = team2SpecialRoles[i];
    assignments.push({
      userId: team2Shuffled[i],
      team: "team2",
      roleId: specialRole
        ? specialRole.roleId
        : (survivorRoleId ?? null),
    });
  }

  return assignments;
}
