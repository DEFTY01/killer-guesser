import { relations, sql } from "drizzle-orm";
import { integer, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// ── Helper: 10-character nanoid-style ID ──────────────────────────

function nanoid10(): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

// ── users ─────────────────────────────────────────────────────────

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  avatar_url: text("avatar_url"),
  role: text("role", { enum: ["player"] })
    .notNull()
    .default("player"),
  is_active: integer("is_active").notNull().default(1),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  updated_at: integer("updated_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── games ─────────────────────────────────────────────────────────

export const games = sqliteTable("games", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => nanoid10()),
  name: text("name").notNull(),
  status: text("status", {
    enum: ["scheduled", "active", "closed", "deleted"],
  })
    .notNull()
    .default("scheduled"),
  start_time: integer("start_time").notNull(),
  vote_window_start: text("vote_window_start"),
  vote_window_end: text("vote_window_end"),
  team1_name: text("team1_name").notNull().default("Good"),
  team2_name: text("team2_name").notNull().default("Evil"),
  winner_team: text("winner_team"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── roles ─────────────────────────────────────────────────────────

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  team: text("team", { enum: ["team1", "team2", "any"] }).notNull(),
  description: text("description"),
  chance_percent: real("chance_percent").notNull().default(10),
  permissions: text("permissions"),
  color_hex: text("color_hex").notNull().default("#2E6DA4"),
  is_default: integer("is_default").notNull().default(0),
});

// ── game_players ──────────────────────────────────────────────────

export const game_players = sqliteTable("game_players", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game_id: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  user_id: integer("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  team: text("team", { enum: ["team1", "team2"] }),
  role_id: integer("role_id").references(() => roles.id),
  is_dead: integer("is_dead").notNull().default(0),
  died_at: integer("died_at"),
  died_location: text("died_location"),
  died_time_of_day: text("died_time_of_day", {
    enum: ["morning", "afternoon", "evening", "day"],
  }),
  revived_at: integer("revived_at"),
  has_tipped: integer("has_tipped").notNull().default(0),
});

// ── votes ─────────────────────────────────────────────────────────

export const votes = sqliteTable("votes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game_id: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  voter_id: integer("voter_id")
    .notNull()
    .references(() => users.id),
  target_id: integer("target_id")
    .notNull()
    .references(() => users.id),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
});

// ── events ────────────────────────────────────────────────────────

export const events = sqliteTable("events", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  game_id: text("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  day: integer("day").notNull(),
  type: text("type").notNull(),
  payload: text("payload"),
  created_at: integer("created_at")
    .notNull()
    .default(sql`(unixepoch())`),
  is_archived: integer("is_archived").notNull().default(0),
});

// ── game_settings ─────────────────────────────────────────────────

export const game_settings = sqliteTable("game_settings", {
  game_id: text("game_id")
    .primaryKey()
    .references(() => games.id, { onDelete: "cascade" }),
  special_role_count: integer("special_role_count"),
  role_chances: text("role_chances"),
  bg_light_url: text("bg_light_url"),
  bg_dark_url: text("bg_dark_url"),
  murder_item_url: text("murder_item_url"),
  murder_item_name: text("murder_item_name"),
  revive_cooldown_seconds: integer("revive_cooldown_seconds"),
});

// ── app_settings (singleton — id is always 1) ────────────────────

export const app_settings = sqliteTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  bg_light_url: text("bg_light_url"),
  bg_dark_url: text("bg_dark_url"),
});

// ── Relations ─────────────────────────────────────────────────────

export const usersRelations = relations(users, ({ many }) => ({
  game_players: many(game_players),
  votes_cast: many(votes, { relationName: "voter" }),
  votes_received: many(votes, { relationName: "target" }),
}));

export const gamesRelations = relations(games, ({ many, one }) => ({
  game_players: many(game_players),
  votes: many(votes),
  events: many(events),
  settings: one(game_settings, {
    fields: [games.id],
    references: [game_settings.game_id],
  }),
}));

export const rolesRelations = relations(roles, ({ many }) => ({
  game_players: many(game_players),
}));

export const gamePlayersRelations = relations(game_players, ({ one }) => ({
  game: one(games, {
    fields: [game_players.game_id],
    references: [games.id],
  }),
  user: one(users, {
    fields: [game_players.user_id],
    references: [users.id],
  }),
  role: one(roles, {
    fields: [game_players.role_id],
    references: [roles.id],
  }),
}));

export const votesRelations = relations(votes, ({ one }) => ({
  game: one(games, {
    fields: [votes.game_id],
    references: [games.id],
  }),
  voter: one(users, {
    fields: [votes.voter_id],
    references: [users.id],
    relationName: "voter",
  }),
  target: one(users, {
    fields: [votes.target_id],
    references: [users.id],
    relationName: "target",
  }),
}));

export const eventsRelations = relations(events, ({ one }) => ({
  game: one(games, {
    fields: [events.game_id],
    references: [games.id],
  }),
}));

export const gameSettingsRelations = relations(game_settings, ({ one }) => ({
  game: one(games, {
    fields: [game_settings.game_id],
    references: [games.id],
  }),
}));
