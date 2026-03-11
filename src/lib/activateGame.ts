import { db } from "@/db";
import { games } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";

/**
 * Activates all scheduled games whose `start_time` has passed (lazy start).
 *
 * Call this from any API route that lists games so that players see the
 * correct status without requiring an explicit admin action.
 *
 * Errors (e.g. SQLITE_NOMEM under Turso memory pressure) are swallowed so
 * that a transient DB failure never crashes the calling page.
 */
export async function activateScheduledGames(): Promise<void> {
  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    await db
      .update(games)
      .set({ status: "active" })
      .where(
        and(eq(games.status, "scheduled"), lte(games.start_time, nowUnix)),
      );
  } catch {
    // Best-effort: activation will be retried on the next request.
  }
}

/**
 * If the given game is still "scheduled" and its `start_time` has passed,
 * flip it to "active".  No-op for games that are already active/closed.
 *
 * Errors are swallowed so that a transient DB failure never crashes the
 * calling page or API route.
 */
export async function activateGameIfReady(gameId: string): Promise<void> {
  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    await db
      .update(games)
      .set({ status: "active" })
      .where(
        and(
          eq(games.id, gameId),
          eq(games.status, "scheduled"),
          lte(games.start_time, nowUnix),
        ),
      );
  } catch {
    // Best-effort: activation will be retried on the next request.
  }
}
