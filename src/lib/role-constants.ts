/** Default color applied to new roles when no color_hex is provided. */
export const DEFAULT_ROLE_COLOR = "#2E6DA4";

/** Exhaustive list of valid role permission keys. */
export const ROLE_PERMISSIONS = [
  "see_killer",
  "revive_dead",
  "see_votes",
  "extra_vote",
  "immunity_once",
] as const;

export type RolePermission = (typeof ROLE_PERMISSIONS)[number];
