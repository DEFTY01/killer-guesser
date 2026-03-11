# Summit of Lies

A real-time social deduction game for ski trip groups. Players are secretly split into Evil (Killers) and Good (Survivors) teams; they vote out suspects each night, use special role abilities, and race to eliminate the other side. An admin dashboard manages games, players, roles, and live match state.

---

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

## Features

### Game Mechanics

- Random team + role assignment (server-side, spoiler-hidden from admin)
- Evil team always has at least one Killer; Good team never gets Killer
- Player-count-based Killer cap (1 Killer for 6+, 2 for 9+, 3 for 15+ players)
- Nightly vote window (HH:MM, recurring daily, per-day override supported)
- Daytime killer tip (life-or-death — wrong guess kills the accuser)
- Medic revival with configurable cooldown; Undead status; re-death supported
- Seer sees all Killer cards; Mayor sees anonymous board; Spy sees live vote breakdown
- Multi-killer win condition: Good team wins only when all Evil team members are eliminated
- Role reveal card on first game join (flip animation, DB-persisted show-once)

### Admin Panel

- Full player, role, and game CRUD
- 4-step game creation wizard (per-team role selector, chance sliders, murder item upload, background upload)
- Live game editor with spoiler toggle, re-roll teams/roles, vote window override
- Game history archive with day-by-day timeline and vote bars

### Technical

- Real-time updates via Ably (player deaths, votes, game end)
- Per-game timezone support; all times stored UTC, displayed in game timezone
- Dark/light theme with per-game background images (light + dark variant)
- Fully responsive: portrait and landscape, iPhone 4s → iPhone 17 Pro Max

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 (CSS-first, no JS config) |
| Database | Turso (libSQL) |
| ORM | Drizzle ORM |
| Auth | NextAuth.js v5 (Auth.js — `next-auth@beta`) |
| Realtime | Ably |
| Object Storage | Vercel Blob |
| Image Processing | Sharp |
| Validation | Zod v4 |
| Unit Testing | Vitest + Testing Library |
| E2E Testing | Playwright |

---

## Quick Start

```bash
git clone https://github.com/DEFTY01/killer-guesser.git
cd killer-guesser
npm install
cp .env.example .env.local   # fill in all required variables
npm run db:migrate
npm run db:seed
npm run dev
```

### Required Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Turso database URL |
| `DATABASE_AUTH_TOKEN` | Turso auth token |
| `NEXTAUTH_SECRET` | NextAuth secret (any random string) |
| `NEXTAUTH_URL` | App base URL (e.g. `http://localhost:3000`) |
| `ADMIN_PASSWORD` | Admin panel password |
| `ABLY_API_KEY` | Ably server-side API key |
| `NEXT_PUBLIC_ABLY_API_KEY` | Ably client-side key |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob token |

---

## Key Routes

| Route | Who | Description |
|---|---|---|
| `/` | Public | Landing page |
| `/login` | Players | Avatar picker login |
| `/lobby` | Players | Active / upcoming / past games |
| `/game/[id]` | Players | Game board |
| `/game/[id]/vote/[day]` | Players | Daily vote page |
| `/game/[id]/summary` | Players | Post-game results |
| `/admin/login` | Admin | Password login |
| `/admin/dashboard` | Admin | Stats + theme settings |
| `/admin/players` | Admin | Player management |
| `/admin/roles` | Admin | Role management |
| `/admin/games` | Admin | Game list |
| `/admin/games/new` | Admin | 4-step game creation wizard |
| `/admin/games/[id]` | Admin | Live game editor |
| `/admin/games/[id]/history` | Admin | Post-game archive |

---

## Branch Strategy

| Branch | Purpose |
|---|---|
| `dev` | Active development — all feature branches merge here first |
| `main` | Production — only stable, reviewed code is merged from `dev` |

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

## Project Structure

For the full directory structure, file purposes, and API route reference see [AGENT_MAP.md](AGENT_MAP.md).
