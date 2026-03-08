import { db } from "@/db";
import { games } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * Called when the killer has received a majority vote during the voting phase.
 *
 * Marks the game as "closed" and records team2 (survivors) as the winner.
 * This is the main win-condition for the non-killer team.
 *
 * @param gameId - The ID of the game to end.
 */
export async function handleKillerDefeated(gameId: string): Promise<void> {
  await db
    .update(games)
    .set({ status: "closed", winner_team: "team2" })
    .where(eq(games.id, gameId));
}
