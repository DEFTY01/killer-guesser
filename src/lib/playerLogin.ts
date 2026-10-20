import { db } from "@/db";
import { users, game_players, games } from "@/db/schema";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import {
  MAX_PIN_ATTEMPTS,
  PIN_LENGTH,
  PIN_LOCK_SECONDS,
  normalizeJoinCode,
  verifyPin,
} from "@/lib/credentials";

export const INVALID_LOGIN = "Invalid game code, player or PIN.";

export type PlayerLoginInput = {
  gameCode: string;
  userId: number;
  pin: string;
};

/**
 * Verifies a player's game code + per-game PIN.
 *
 * Failures are deliberately uniform so a caller cannot tell a wrong code from
 * a wrong player. After MAX_PIN_ATTEMPTS wrong PINs the player is locked for
 * PIN_LOCK_SECONDS; the counter lives in the database so it holds across
 * serverless instances.
 */
export async function verifyPlayerLogin({ gameCode, userId, pin }: PlayerLoginInput) {
  const code = normalizeJoinCode(gameCode);
  if (!code || !Number.isInteger(userId) || !/^\d+$/.test(pin) || pin.length !== PIN_LENGTH) {
    throw new Error(INVALID_LOGIN);
  }

  const [row] = await db
    .select({
      gameId: games.id,
      gamePlayerId: game_players.id,
      pinHash: game_players.pin_hash,
      lockedUntil: game_players.pin_locked_until,
      userName: users.name,
      avatarUrl: users.avatar_url,
    })
    .from(games)
    .innerJoin(game_players, eq(game_players.game_id, games.id))
    .innerJoin(users, eq(game_players.user_id, users.id))
    .where(
      and(
        eq(games.join_code, code),
        or(eq(games.status, "active"), eq(games.status, "scheduled")),
        eq(game_players.user_id, userId),
        eq(users.is_active, 1),
      ),
    )
    .limit(1);

  if (!row) throw new Error(INVALID_LOGIN);

  if (!row.pinHash) {
    throw new Error("No PIN set for you yet. Ask your host!");
  }

  const now = Math.floor(Date.now() / 1000);
  const locked = () => {
    const minutes = Math.max(1, Math.ceil(((row.lockedUntil ?? now) - now) / 60));
    return new Error(`Too many attempts. Try again in ${minutes} min.`);
  };

  // Spend an attempt BEFORE checking the PIN, atomically: a burst of parallel
  // requests each gets its own counter value, so only the first
  // MAX_PIN_ATTEMPTS ever reach the (expensive) hash comparison.
  const [claim] = await db
    .update(game_players)
    .set({ pin_failed_attempts: sql`${game_players.pin_failed_attempts} + 1` })
    .where(
      and(
        eq(game_players.id, row.gamePlayerId),
        or(isNull(game_players.pin_locked_until), lte(game_players.pin_locked_until, now)),
      ),
    )
    .returning({ attempts: game_players.pin_failed_attempts });

  if (!claim || claim.attempts > MAX_PIN_ATTEMPTS) throw locked();

  if (!(await verifyPin(pin, row.pinHash))) {
    if (claim.attempts >= MAX_PIN_ATTEMPTS) {
      await db
        .update(game_players)
        .set({ pin_failed_attempts: 0, pin_locked_until: now + PIN_LOCK_SECONDS })
        .where(eq(game_players.id, row.gamePlayerId));
    }
    throw new Error(INVALID_LOGIN);
  }

  await db
    .update(game_players)
    .set({ pin_failed_attempts: 0, pin_locked_until: null })
    .where(eq(game_players.id, row.gamePlayerId));

  return {
    id: String(userId),
    name: row.userName,
    avatar_url: row.avatarUrl,
    role: "player" as const,
    activeGameId: row.gameId,
  };
}
