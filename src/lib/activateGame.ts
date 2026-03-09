import { db } from "@/db";
import { games } from "@/db/schema";
import { and, eq, lte } from "drizzle-orm";

/**
 * Activates all scheduled games whose `start_time` has passed (lazy start).
 *
 * Call this from any API route that lists games so that players see the
 * correct status without requiring an explicit admin action.
 */
export async function activateScheduledGames(): Promise<void> {
  const nowUnix = Math.floor(Date.now() / 1000);
  await db
    .update(games)
    .set({ status: "active" })
    .where(
      and(eq(games.status, "scheduled"), lte(games.start_time, nowUnix)),
    );
}

/**
 * If the given game is still "scheduled" and its `start_time` has passed,
 * flip it to "active".  No-op for games that are already active/closed.
 */
export async function activateGameIfReady(gameId: string): Promise<void> {
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
}
