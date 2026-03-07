// Shared TypeScript types used across the application.

export type UserRole = "admin" | "moderator";
export type GameStatus = "waiting" | "active" | "finished";

export interface PlayerSession {
  playerId: string;
  nickname: string;
  avatarUrl: string | null;
  sessionToken: string;
  expiresAt: number;
}

export interface GameRoom {
  id: string;
  code: string;
  status: GameStatus;
  players: Array<{
    id: string;
    nickname: string;
    avatarUrl: string | null;
    score: number;
  }>;
}

export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string };
