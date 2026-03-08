// Shared TypeScript types used across the application.

import type {
  users as usersTable,
  games as gamesTable,
  roles as rolesTable,
  game_players as gamePlayersTable,
  votes as votesTable,
  events as eventsTable,
  game_settings as gameSettingsTable,
} from "@/db/schema";

// ── Domain string unions ───────────────────────────────────────────

export type UserRole = "player";
export type GameStatus = "scheduled" | "active" | "closed" | "deleted";
export type TeamName = "team1" | "team2";
export type TimeOfDay = "morning" | "afternoon" | "evening";

// ── Legacy player session (player onboarding flow) ────────────────

export interface PlayerSession {
  playerId: number;
  name: string;
  avatarUrl: string | null;
  sessionToken: string;
  expiresAt: number;
}

export interface GameRoom {
  id: string;
  name: string;
  status: GameStatus;
  players: Array<{
    id: number;
    name: string;
    avatarUrl: string | null;
    team: TeamName | null;
  }>;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };

// ── Drizzle-inferred row types ────────────────────────────────────

export type User = typeof usersTable.$inferSelect;
export type NewUser = typeof usersTable.$inferInsert;

export type Game = typeof gamesTable.$inferSelect;
export type NewGame = typeof gamesTable.$inferInsert;

export type Role = typeof rolesTable.$inferSelect;
export type NewRole = typeof rolesTable.$inferInsert;

export type GamePlayer = typeof gamePlayersTable.$inferSelect;
export type NewGamePlayer = typeof gamePlayersTable.$inferInsert;

export type Vote = typeof votesTable.$inferSelect;
export type NewVote = typeof votesTable.$inferInsert;

export type Event = typeof eventsTable.$inferSelect;
export type NewEvent = typeof eventsTable.$inferInsert;

export type GameSettings = typeof gameSettingsTable.$inferSelect;
export type NewGameSettings = typeof gameSettingsTable.$inferInsert;
