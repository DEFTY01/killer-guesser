# Summit of Lies

**Summit of Lies** is a real-time multiplayer social-deduction game inspired by
the classic "Mafia / Werewolf" format, set in a mountain resort.  One player
is secretly assigned the role of **Killer**.  All other players must identify
and eliminate the killer before the killer eliminates them.

## How It Works

1. **Admin creates a game** — the admin assigns players to two teams, picks a
   secret murder weapon, sets a daily voting window (HH:MM UTC), and rolls
   hidden roles for each player (Killer, Seer, Healer, Mayor, …).
2. **Players join the lobby** — each player logs in by clicking their avatar,
   then sees which game they belong to and who their team-mates are.
3. **The game begins** — players can see the murder-weapon card and the live
   player grid.  Each night one player can die; during the day players try to
   identify the killer.
4. **Role abilities** (resolved server-side, never exposed to unauthorized callers):
   - **Killer** — wins when all opposing players are eliminated.
   - **Seer** — can see the killer's identity on the board.
   - **Healer** — can revive one dead player (subject to a cooldown).
   - **Mayor** — strips role/team info from the board (can't reveal allegiances).
   - **Spy** — can see all votes cast during the vote window.
5. **Voting** — during the configured vote window players cast one vote per day.
   The player with the majority of votes is eliminated.  The Killer can also be
   identified directly by a living player's **Guess the Killer** tip (one per player).
6. **Game ends** — either the killer is voted out / correctly tipped, or the
   killer eliminates all opposing players.  Results are published over Ably in
   real time and a results modal is shown to all players.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.1 (App Router, React Server Components) |
| Language | TypeScript 5 |
| UI | React 19 · Tailwind CSS v4 (CSS-first, no JS config) |
| Database | Turso (libSQL / SQLite edge DB) |
| ORM | Drizzle ORM |
| Validation | Zod v4 |
| Admin auth | Plain cookie (`admin_session`) set by custom login route; constant-time comparison via `crypto.timingSafeEqual` (SHA-256) |
| Player auth | Auth.js v5 (`next-auth@beta`) — JWT strategy, avatar-click sign-in |
| Realtime | Ably (pub/sub over WebSocket) |
| Object storage | Vercel Blob |
| Avatar resize | Sharp (Lanczos3 · 500 × 500 px PNG) |
| Unit testing | Vitest + React Testing Library |
| E2E testing | Playwright |
| CI/CD | GitHub Actions |
| Hosting | Vercel |

---

## Developer Setup

### 1. Prerequisites

- Node.js ≥ 20  
- A [Turso](https://turso.tech) account **or** a local SQLite file (`file:local.db`)
- (Optional) An [Ably](https://ably.com) account for realtime events  
- (Optional) A [Vercel Blob](https://vercel.com/storage/blob) store for file uploads  

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment variables

```bash
cp .env.example .env.local
```

Open `.env.local` and fill in the required values:

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Turso DB URL (`libsql://…`) or `file:local.db` for local dev |
| `DATABASE_AUTH_TOKEN` | Yes (Turso) | Turso auth token (omit when using a local file) |
| `AUTH_SECRET` | Yes | A random 32-byte secret for Auth.js JWT signing |
| `ADMIN_PASSWORD` | Yes | The admin login password (never stored in DB) |
| `NEXT_PUBLIC_ABLY_API_KEY` | Optional | Ably publishable key for client-side realtime subscriptions |
| `ABLY_API_KEY` | Optional | Ably server key for publishing events from API routes |
| `BLOB_READ_WRITE_TOKEN` | Optional | Vercel Blob read/write token for file upload routes |

### 4. Push the schema

```bash
# Push schema directly (dev only — no migration files needed):
npm run db:push

# Or generate + run migration files:
npm run db:generate
npm run db:migrate
```

### 5. Seed the database

The seed script inserts the 6 default roles (Killer, Seer, Healer, Mayor, Spy,
Villager) needed to create your first game:

```bash
npm run db:seed
```

### 6. Start the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).  The admin panel is at
[http://localhost:3000/admin](http://localhost:3000/admin).

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | ESLint |
| `npm run type-check` | TypeScript type-check (no emit) |
| `npm run test` | Vitest unit tests |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Unit tests with V8 coverage report |
| `npm run test:ci` | Lint + type-check + build (used in CI) |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run test:e2e:ui` | Playwright with interactive UI mode |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio |
| `npm run db:seed` | Seed default roles |

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `dev` | Active development — all feature work merges here first |
| `main` | Production — only stable, reviewed code is merged from `dev` |

Feature branches are created off `dev` and merged back via pull request.
`main` is only updated by merging `dev` after all CI checks pass, then tagged
for release.

---

## Feature List

### Admin panel (`/admin`)

- **Player management** — create, edit, soft-delete player accounts; upload 500 × 500 px avatars to Vercel Blob.
- **Role management** — create / edit roles with name, team affiliation, weighted chance percentage, color, description, and permission flags (`see_killer`, `revive_dead`, `see_votes`, `extra_vote`, `immunity_once`).
- **Game creation wizard** — 4-step wizard: game details (name, start time, vote window), player–team assignment (avatar grid + randomize), role/settings (murder item image + name, revive cooldown), summary + submit.  Entire creation is atomic (single DB transaction).
- **Live game editor** — status bar, inline role selector per player, mark-player-dead toggle, vote-window editor, team/role re-roll, close-voting action (computes results + publishes Ably event), end/delete game.
- **Game history** — read-only post-game archive: header card, day-by-day event timeline, player fates table (avatar/role/team/death), per-day anonymous vote bar charts.
- **Theme settings** — upload light/dark background images; reset to default.

### Player game (`/game`)

- **Avatar-click login** — players sign in by clicking their avatar; Auth.js JWT session issued with role + game assignment.
- **Lobby** — active, upcoming (with countdown), and past games (win/loss indicator); skeleton loading states.
- **Participants page** — pre-game avatar grid with team badges (no role or dead info exposed).
- **Game board** — murder-weapon card (fullscreen modal), live player grid (dead overlay, killer border for Seer, revive button for Healer), self-death modal (location + time-of-day).
  - **Seer** 👁️ — sees `killer_id` and killer border on board.
  - **Mayor** ⚖️ — stripped board (no role colors, no team).
  - **Healer** 💊 — revive button on dead players (cooldown enforced server-side).
  - **Guess the Killer** 🔍 FAB — visible for living non-killer players who haven't tipped yet.
- **Voting page** — vote for a suspect; collapsible "Secret Info 🕵️" panel for Spy (live vote list via Ably); results view when vote is closed.
- **Real-time events** — `PLAYER_DIED`, `PLAYER_REVIVED`, `VOTE_CAST`, `VOTE_CLOSED`, `GAME_ENDED` all delivered over Ably and reflected instantly in the UI.

### Security

- All admin API routes require an `admin_session` httpOnly cookie; absence returns 403.
- Admin password comparison uses `crypto.timingSafeEqual` over SHA-256 hashes — no timing side-channel.
- `ADMIN_PASSWORD` is never logged or stored in the database.
- The admin identity is never included in player lists (admin is not a DB user).
- `killer_id` is only returned to callers whose role has the `see_killer` permission.
- Vote details are only returned to callers whose role has the `see_votes` permission.
- Every POST/PATCH body is validated with Zod before any database write.

---

## Screenshots

> _Screenshots will be added once the UI is finalized for v1.0.0._
>
> Planned screenshots:
> - Landing / home page
> - Player avatar-click login
> - Game board (player view)
> - Voting page
> - Admin dashboard
> - Admin game creation wizard
> - Live game editor
> - Post-game history viewer

---

## Documentation

- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md)
- [Database schema](docs/database.md)
- [Avatar processing](docs/avatar.md)
- [Deployment](docs/deployment.md)
- [Agent map](AGENT_MAP.md)

---

## Deploying to Vercel

1. Push to GitHub.
2. Import the repository in the [Vercel dashboard](https://vercel.com/new).
3. Set the environment variables from `.env.example` in the project settings.
4. Deploy — Vercel auto-detects Next.js.

---

## License

MIT
