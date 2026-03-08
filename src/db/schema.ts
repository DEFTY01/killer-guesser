import { sql } from "drizzle-orm";
import {
  integer,
  sqliteTable,
  text,
  blob,
} from "drizzle-orm/sqlite-core";

// ── Admin users (Auth.js) ─────────────────────────────────────────

export const users = sqliteTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").notNull().unique(),
  emailVerified: integer("emailVerified", { mode: "timestamp_ms" }),
  image: text("image"),
  role: text("role", { enum: ["admin", "moderator"] })
    .notNull()
    .default("admin"),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

export const accounts = sqliteTable("accounts", {
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  provider: text("provider").notNull(),
  providerAccountId: text("providerAccountId").notNull(),
  refresh_token: text("refresh_token"),
  access_token: text("access_token"),
  expires_at: integer("expires_at"),
  token_type: text("token_type"),
  scope: text("scope"),
  id_token: text("id_token"),
  session_state: text("session_state"),
});

export const sessions = sqliteTable("sessions", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: text("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

export const verificationTokens = sqliteTable("verificationTokens", {
  identifier: text("identifier").notNull(),
  token: text("token").notNull(),
  expires: integer("expires", { mode: "timestamp_ms" }).notNull(),
});

// ── Players (avatar/session flow) ────────────────────────────────

export const players = sqliteTable("players", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  nickname: text("nickname").notNull(),
  /** Stored as a relative path or data URL after neural-resize to 500×500 */
  avatarUrl: text("avatarUrl"),
  avatarData: blob("avatarData", { mode: "buffer" }),
  sessionToken: text("sessionToken").unique(),
  sessionExpiresAt: integer("sessionExpiresAt", { mode: "timestamp_ms" }),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Games ─────────────────────────────────────────────────────────

export const games = sqliteTable("games", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  code: text("code").notNull().unique(),
  status: text("status", {
    enum: ["waiting", "active", "finished"],
  })
    .notNull()
    .default("waiting"),
  createdBy: text("createdBy").references(() => users.id),
  createdAt: integer("createdAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
  startedAt: integer("startedAt", { mode: "timestamp_ms" }),
  finishedAt: integer("finishedAt", { mode: "timestamp_ms" }),
});

export const gamePlayers = sqliteTable("gamePlayers", {
  gameId: text("gameId")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  playerId: text("playerId")
    .notNull()
    .references(() => players.id, { onDelete: "cascade" }),
  score: integer("score").notNull().default(0),
  joinedAt: integer("joinedAt", { mode: "timestamp_ms" })
    .notNull()
    .default(sql`(unixepoch() * 1000)`),
});

// ── Type helpers ──────────────────────────────────────────────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Player = typeof players.$inferSelect;
export type NewPlayer = typeof players.$inferInsert;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GamePlayer = typeof gamePlayers.$inferSelect;
