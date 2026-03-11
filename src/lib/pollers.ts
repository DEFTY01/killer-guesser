/**
 * Active poller registry.
 *
 * Tracks setInterval IDs keyed by game ID so that background vote-window
 * polling can be cancelled when a game ends.  Works in both Node.js (server)
 * and browser (client) environments because `setInterval` / `clearInterval`
 * exist in both.
 *
 * Usage:
 *  - When starting a poll:  `activePollers.set(gameId, intervalId)`
 *  - When ending the game:  `cleanupPoller(gameId)`
 */
export const activePollers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Stops and removes the active poller for the given game, if one is registered.
 *
 * @param gameId - The game's identifier.
 */
export function cleanupPoller(gameId: string): void {
  const id = activePollers.get(gameId);
  if (id !== undefined) {
    clearInterval(id);
    activePollers.delete(gameId);
  }
}
