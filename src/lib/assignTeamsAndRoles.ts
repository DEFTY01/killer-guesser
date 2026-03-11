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
  /** True if this role is an Evil role (can only go to the Evil team). */
  isEvil: boolean;
  /**
   * The `team` column value from the `roles` table.
   * "team1" → only eligible for the team1-aligned side.
   * "team2" → only eligible for the team2-aligned side.
   * "any"   → eligible for either team.
   */
  team?: "team1" | "team2" | "any";
}

/** Input configuration for team and role assignment. */
export interface AssignmentInput {
  /** Array of user IDs to distribute across teams. */
  playerIds: number[];
  /** Maximum number of players allowed on team1 (admin-requested cap). */
  team1MaxPlayers: number;
  /** Maximum number of players allowed on team2. */
  team2MaxPlayers: number;
  /** True if team1 is the Evil team; false means team2 is Evil. */
  isEvilTeam1: boolean;
  /** Roles eligible for team1. */
  team1Roles: RoleEntry[];
  /** How many special roles to assign on team1 (beyond the mandatory Killer). */
  team1SpecialCount: number;
  /** The role ID of the Killer role (must exist in the Evil team's roles). */
  killerRoleId: number;
  /** Roles eligible for team2. */
  team2Roles: RoleEntry[];
  /** How many special roles to assign on team2 via weighted draw. */
  team2SpecialCount: number;
  /** The role ID of the default "Survivor" role for Good team players without a special role. */
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

// ── Killer cap resolver ───────────────────────────────────────────

/**
 * Resolves the effective Evil team cap for a given player count.
 *
 * Player-count-based rules:
 *   players ≤ 6  → exactly 1 Killer  (min 1, max 1)
 *   players ≤ 9  → exactly 2 Killers (min 2, max 2)
 *   players > 9  → 2–3 Killers       (min 2, max 3)
 *
 * The resolved cap is clamped to [killerMinByCount, killerMaxByCount], then
 * further capped to totalPlayers - 1 to ensure at least one player remains
 * on the Good team.
 *
 * If adminCap differs from the resolved cap, a console.warn is emitted —
 * no exception is thrown.
 *
 * @param playerCount - Total number of players in the game.
 * @param adminCap    - The cap requested by the admin.
 * @returns The resolved Evil team cap.
 */
export function resolveKillerCap(
  playerCount: number,
  adminCap: number,
): number {
  let killerMinByCount: number;
  let killerMaxByCount: number;

  if (playerCount <= 6) {
    killerMinByCount = 1;
    killerMaxByCount = 1;
  } else if (playerCount <= 9) {
    killerMinByCount = 2;
    killerMaxByCount = 2;
  } else {
    // 10+ players (covers ≤ 15 and beyond)
    killerMinByCount = 2;
    killerMaxByCount = 3;
  }

  // Clamp to player-count-based [min, max]
  let resolvedCap = Math.min(adminCap, killerMaxByCount);
  resolvedCap = Math.max(resolvedCap, killerMinByCount);

  // Always leave at least 1 player in the Good team
  resolvedCap = Math.min(resolvedCap, playerCount - 1);

  // Ensure at least 1
  resolvedCap = Math.max(resolvedCap, 1);

  if (adminCap !== resolvedCap) {
    console.warn(
      `[resolveKillerCap] Admin requested Evil team cap of ${adminCap} but it was adjusted to ${resolvedCap} ` +
        `(player-count-based range for ${playerCount} players: ${killerMinByCount}–${killerMaxByCount}).`,
    );
  }

  return resolvedCap;
}

// ── Main assignment function ──────────────────────────────────────

/**
 * Assigns teams and roles to players server-side.
 *
 * Algorithm:
 * 1. Validate hard constraints (throws on violation).
 * 2. Resolve the Evil team cap via resolveKillerCap.
 * 3. Shuffle the player array using Fisher-Yates.
 * 4. Fill the Evil team with the first resolvedEvilCap players; the rest go to Good.
 * 5. Assign exactly one Killer role to a random Evil team player.
 * 6. Assign additional is_evil special roles to remaining Evil team players.
 * 7. For the Good team, assign is_evil=0 special roles via weighted draw.
 * 8. Remaining Good team players receive the default Survivor role.
 *
 * @param input - The assignment configuration.
 * @returns An array of player assignments with team and role info.
 * @throws If any hard constraint is violated.
 */
export function assignTeamsAndRoles(
  input: AssignmentInput,
): PlayerAssignment[] {
  const {
    playerIds,
    team1MaxPlayers,
    team2MaxPlayers,
    isEvilTeam1,
    team1Roles,
    team1SpecialCount,
    killerRoleId,
    team2Roles,
    team2SpecialCount,
    survivorRoleId,
  } = input;

  // Derive evil/good roles and caps from isEvilTeam1
  const evilRoles = isEvilTeam1 ? team1Roles : team2Roles;
  const goodRoles = isEvilTeam1 ? team2Roles : team1Roles;
  const evilAdminCap = isEvilTeam1 ? team1MaxPlayers : team2MaxPlayers;
  const evilSpecialCount = isEvilTeam1 ? team1SpecialCount : team2SpecialCount;
  const goodSpecialCount = isEvilTeam1 ? team2SpecialCount : team1SpecialCount;

  // ── Hard constraints ──────────────────────────────────────────

  if (evilAdminCap < 1) {
    throw new Error("Evil team must have at least 1 player.");
  }

  const killerInEvil = evilRoles.some((r) => r.roleId === killerRoleId);
  if (!killerInEvil) {
    throw new Error("Killer role must be in the Evil team.");
  }

  const killerInGood = goodRoles.some((r) => r.roleId === killerRoleId);
  if (killerInGood) {
    throw new Error("Killer role cannot be assigned to the Good team.");
  }

  // ── Filter roles by role.team column value ───────────────────
  // "team1" roles → only for the team1-aligned side (evil when isEvilTeam1=true).
  // "team2" roles → only for the team2-aligned side (good when isEvilTeam1=true).
  // "any"   roles → eligible for either side.
  // The evilTeamId/goodTeamId labels correspond to the DB team column values.
  const evilTeamId: "team1" | "team2" = isEvilTeam1 ? "team1" : "team2";
  const goodTeamId: "team1" | "team2" = isEvilTeam1 ? "team2" : "team1";

  const filteredEvilRoles = evilRoles.filter((r) => {
    if (r.team !== undefined) {
      return r.team === evilTeamId || r.team === "any";
    }
    // Fallback: use isEvil flag when team field not provided.
    return r.isEvil;
  });

  const filteredGoodRoles = goodRoles.filter((r) => {
    if (r.team !== undefined) {
      return r.team === goodTeamId || r.team === "any";
    }
    // Fallback: use isEvil flag when team field not provided.
    return !r.isEvil;
  });

  if (filteredEvilRoles.length === 0) {
    throw new Error(
      "Evil team has no eligible Evil roles after filtering. Add is_evil roles for the Evil team.",
    );
  }

  // ── Resolve Evil team cap ─────────────────────────────────────

  const resolvedEvilCap = resolveKillerCap(playerIds.length, evilAdminCap);

  // ── Minimum Evil role count guard ─────────────────────────────

  if (filteredEvilRoles.length < resolvedEvilCap) {
    throw new Error(
      "Not enough Evil roles to fill the Evil team. Add more Evil roles or reduce the Evil team cap.",
    );
  }

  // ── 1. Shuffle ────────────────────────────────────────────────
  const shuffled = fisherYatesShuffle([...playerIds]);

  // ── 2. Distribute teams: Evil team fills up to resolvedEvilCap ─
  const evilCount = Math.min(resolvedEvilCap, shuffled.length);
  const evilPlayers = shuffled.slice(0, evilCount);
  const goodPlayers = shuffled.slice(evilCount);

  const assignments: PlayerAssignment[] = [];

  // ── 3. Evil team: assign exactly one Killer ───────────────────
  const evilShuffled = fisherYatesShuffle([...evilPlayers]);
  const killerPlayerId = evilShuffled[0];
  const remainingEvil = evilShuffled.slice(1);

  if (killerPlayerId !== undefined) {
    assignments.push({
      userId: killerPlayerId,
      team: isEvilTeam1 ? "team1" : "team2",
      roleId: killerRoleId,
    });
  }

  // ── 4. Evil team: assign additional is_evil special roles ─────
  const evilNonKillerRoles = filteredEvilRoles.filter(
    (r) => r.roleId !== killerRoleId,
  );
  const evilSpecialRoles = weightedRandomSelect(
    evilNonKillerRoles,
    Math.min(evilSpecialCount, remainingEvil.length),
  );

  for (let i = 0; i < remainingEvil.length; i++) {
    const specialRole = evilSpecialRoles[i];
    assignments.push({
      userId: remainingEvil[i],
      team: isEvilTeam1 ? "team1" : "team2",
      roleId: specialRole ? specialRole.roleId : null,
    });
  }

  // ── 5. Good team: assign is_evil=0 special roles via weighted draw ─
  const goodShuffled = fisherYatesShuffle([...goodPlayers]);
  const goodSpecialRoles = weightedRandomSelect(
    filteredGoodRoles,
    Math.min(goodSpecialCount, goodShuffled.length),
  );

  for (let i = 0; i < goodShuffled.length; i++) {
    const specialRole = goodSpecialRoles[i];
    assignments.push({
      userId: goodShuffled[i],
      team: isEvilTeam1 ? "team2" : "team1",
      roleId: specialRole
        ? specialRole.roleId
        : (survivorRoleId ?? null),
    });
  }

  // ── Post-assignment guard: detect role↔team mismatch ─────────
  // Verify that no good-team player received a role whose team column
  // restricts it to the evil team. This catches the Killer-on-good-team bug.
  const allRoleEntriesById = new Map<number, RoleEntry>(
    [...evilRoles, ...goodRoles].map((r) => [r.roleId, r]),
  );

  for (const assignment of assignments) {
    const isGoodTeam = assignment.team === (isEvilTeam1 ? "team2" : "team1");
    if (!isGoodTeam) continue;
    if (assignment.roleId === null) continue;

    const entry = allRoleEntriesById.get(assignment.roleId);
    if (!entry) continue;

    const roleTeam = entry.team;
    const hasViolation =
      roleTeam !== undefined &&
      roleTeam !== "any" &&
      roleTeam !== goodTeamId;

    if (hasViolation) {
      const msg =
        `[assignTeamsAndRoles] Guard violation: good-team player (userId=${assignment.userId}) ` +
        `received a role (id=${assignment.roleId}) restricted to team="${roleTeam}" ` +
        `but good team is "${goodTeamId}".`;
      if (process.env.NODE_ENV === "development") {
        throw new Error(msg);
      } else {
        console.error(msg);
      }
    }
  }

  return assignments;
}
