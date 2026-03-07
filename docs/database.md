# Database

## Provider: Turso (libSQL)

[Turso](https://turso.tech) is a globally distributed edge database built on libSQL (a fork of SQLite). It is compatible with the Drizzle ORM SQLite dialect.

## Local development

When `TURSO_DATABASE_URL` is not set, the app falls back to a local SQLite file (`file:local.db`). No Turso account is needed to run locally.

## Schema overview

| Table | Purpose |
|---|---|
| `users` | Admin users (managed by Auth.js) |
| `accounts` | OAuth accounts linked to users |
| `sessions` | Auth.js server-side sessions |
| `verificationTokens` | Email verification tokens |
| `players` | Game players (nickname, avatar, session token) |
| `games` | Game rooms |
| `gamePlayers` | Join table — player scores per game |

## Migrations

Migrations are managed by **Drizzle Kit**.

```bash
# Generate a new migration after changing schema.ts
npm run db:generate

# Apply migrations to the target database
npm run db:migrate

# Push schema directly (dev only — skips migration files)
npm run db:push
```

Migration files are stored in `./drizzle/`.

## Connection string

```
# Turso cloud
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=eyJ...

# Local file (dev / CI)
TURSO_DATABASE_URL=file:local.db
```
