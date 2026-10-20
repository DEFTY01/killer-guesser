# Deployment

## Vercel (recommended)

1. Push your repository to GitHub.
2. Go to [vercel.com/new](https://vercel.com/new) and import the repository.
3. Vercel auto-detects Next.js — no additional configuration required.
4. Set the following **environment variables** in the Vercel project settings:

| Variable | Value |
|---|---|
| `DATABASE_URL` (or `TURSO_DATABASE_URL`) | `libsql://your-db.turso.io` |
| `DATABASE_AUTH_TOKEN` (or `TURSO_AUTH_TOKEN`) | Your Turso auth token |
| `AUTH_SECRET` | Random 32-byte secret (`openssl rand -base64 33`) |
| `AUTH_URL` | `https://your-app.vercel.app` |

5. Deploy. Vercel runs `npm run build` automatically.

## Branch protection (recommended)

In GitHub → Settings → Branches → Add rule for `main`:

- ✅ Require a pull request before merging
- ✅ Require status checks to pass before merging
  - `Type check & lint`
  - `Unit tests (Vitest)`
  - `Next.js build`

## Environment tiers

| Environment | Database | Notes |
|---|---|---|
| Local dev | `file:local.db` (optional) | Explicitly set `DATABASE_URL=file:local.db` for local SQLite |
| CI | `file:ci.db` | Set in `.github/workflows/ci.yml` env block |
| Staging | Turso dev database | Set `DATABASE_URL` in Vercel preview env |
| Production | Turso production database | Set in Vercel production env (`file:*` is not supported) |

## Database schema changes

Apply schema changes to a database with `npm run db:push` (this is what CI does). The Drizzle migration journal in `src/db/migrations/` is not complete enough to build a fresh database with `npm run db:migrate`: there are two `0013` migrations and some hand-written ones are missing from the journal. Keep adding migrations with `npm run db:generate`, but treat `db:push` as the source of truth until the journal is baselined.

New games get a join code and every player a PIN when the game is created. Games created before that have no PIN until an admin opens the game page and uses "New PIN" for each player.
