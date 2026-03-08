/**
 * Determines whether a given player is the killer.
 *
 * @param playerId  - The `user_id` of the player to check.
 * @param killerId  - The `user_id` of the killer, or `undefined` when the
 *                    caller does not have the `see_killer` permission (the API
 *                    omits the field for non-Seer roles).
 * @returns `true` when both values are defined and equal.
 */
export function isKiller(
  playerId: number,
  killerId: number | undefined,
): boolean {
  return killerId !== undefined && playerId === killerId;
}
