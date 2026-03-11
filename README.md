# Summit of Lies

A real-time social deduction game for ski trip groups. Players are secretly split into Evil (Killers) and Good (Survivors) teams; they vote out suspects each night, use special role abilities, and race to eliminate the other side. An admin dashboard manages games, players, roles, and live match state.

---

## How It Works

1. **Admin creates a game** — assigns players to two teams (Evil / Good), picks a
   secret murder weapon (image + name), sets a daily vote window (HH:MM in the
   game's IANA timezone), and rolls hidden roles server-side (Killer, Survivor,
   Seer, Healer, Mayor, Spy).
2. **Players join the lobby** — each player signs in by clicking their avatar;
   the lobby shows active games, upcoming games with a live countdown, and past
   games with a win/loss indicator.
3. **The game begins** — on first join each player sees a tap-to-flip role reveal
   card (shows role name, team, and description).  They can then view the
   murder-weapon card and the live player grid.
4. **Role abilities** (resolved server-side, never exposed to unauthorized callers):
   - **Killer** — evil team; wins when all good team members are eliminated.
   - **Survivor** — good team default; no special abilities.
   - **Seer** — sees the Killer highlighted on the board.
   - **Healer** — can revive dead players (configurable cooldown); revived players
     become Undead and can be re-killed.
   - **Mayor** — sees an anonymous board (no role colors or team info).
   - **Spy** — sees a live vote-cast list during the vote window via Ably.
5. **Voting & tips** — during the vote window players cast one vote per day; most
   votes eliminates a player.  Any living non-Killer player can also make a
   one-time daytime **Guess the Killer** tip: correct → Killer eliminated and Good
   wins; wrong → the accuser dies.
6. **Game ends** — when all Evil or all Good players are eliminated, results are
   broadcast over Ably in real time.  Players are taken to a post-game summary
   showing the winner, full role/fate table, and day-by-day vote history.

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
- Role reveal card on first game join (flip animation, sessionStorage show-once per browser session)

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

- **Player management** — create, edit, soft-delete player accounts; upload avatars (webp / gif / png / jpeg, max 4 MB) resized to 500 × 500 px PNG via Sharp and stored in Vercel Blob.
- **Role management** — create / edit roles with name, evil flag (`is_evil`), weighted chance percentage, color, description, and permission flags (`see_killer`, `revive_dead`, `see_votes`, `extra_vote`, `immunity_once`).
- **Game creation wizard** — 4-step: ① game details (name, start time, IANA timezone, vote window), ② player–team assignment (avatar grid + randomize, Evil team checkbox), ③ role config (murder item image + name, per-team role selector with chance sliders, revive cooldown, team size caps), ④ summary + submit.  Entire creation is a single atomic DB transaction.
- **Live game editor** — status bar, inline role selector per player, mark-player-dead toggle, per-day vote-window override, team/role re-roll (Killer cap rules enforced), close-voting action (computes results + publishes `VOTE_CLOSED`), spoiler toggle, end/delete game.
- **Game history** — read-only post-game archive: header card, day-by-day event timeline, player fates table (avatar/role/team/dead/undead), per-day anonymous vote bar charts.
- **Theme settings** — upload global light/dark background images (stored in `app_settings`); per-game light/dark backgrounds override the global default.

### Player game (`/game`)

- **Avatar-click login** — players sign in by clicking their avatar; NextAuth v5 JWT session issued with role + active game ID.
- **Lobby** — active games (direct link), upcoming games (live countdown), and past games (win/loss indicator); skeleton loading states.
- **Pre-game waiting room** — `/game/[id]/lobby`; shows scheduled start time, live participant avatar grid, auto-redirects when game activates.
- **Participants page** — `/participants`; avatar grid with team badges (no role or death info exposed).
- **Game board** (`/game/[id]`):
  - **Role reveal modal** — tap-to-flip card on first join; shows role name, team name, and description; shown once per browser session (stored in sessionStorage per game ID).
  - **Murder weapon card** — image + name; tap for fullscreen modal.
  - **Player grid** — dead overlay, self-death modal (location + time-of-day picker).
  - **Seer** 👁️ — sees `killer_id` and killer red border on board.
  - **Mayor** ⚖️ — stripped board (no role colors, no team info).
  - **Healer** 💊 — revive button on dead players (cooldown enforced server-side); revived players shown as Undead.
  - **Guess the Killer** 🔍 FAB — 3-screen modal: select suspect → confirm ("if you're wrong, you die!") → result; one-time use per player.
- **Voting page** (`/game/[id]/vote/[day]`) — vote for a suspect; Spy sees a live vote-cast list via Ably (`VOTE_CAST` events); closed window shows ranked results.
- **Post-game summary** (`/game/[id]/summary`) — winner banner with personal win/loss, full player list (role, team, dead/undead/survived, death location + accused name), vote history by day.
- **Real-time events** — `PLAYER_DIED`, `PLAYER_REVIVED`, `VOTE_CAST`, `VOTE_CLOSED`, `GAME_ENDED` delivered over Ably and reflected instantly in the UI.

### Security

- All admin API routes require a valid NextAuth session with `role = "admin"`; absence returns 403.
- Admin password comparison uses `crypto.timingSafeEqual` over SHA-256 hashes — prevents timing side-channel attacks.
- `ADMIN_PASSWORD` is never logged or stored in the database; admin identity is never included in player lists.
- `killer_id` is only returned to callers whose role has the `see_killer` permission.
- Vote details are only returned to callers whose role has the `see_votes` permission.
- Every POST/PATCH body is validated with Zod before any database write.
- Upload routes (`/api/upload/avatar`, `/api/upload/background`, `/api/upload/murder-item`) require admin session; enforce 4 MB size limit and MIME-type allowlist.

---

## Screenshots

> _Screenshots will be added once the UI is finalized for v1.0.0._
>
> Planned screenshots:
> - Landing / home page
> - Player avatar-click login
> - Lobby (active, upcoming with countdown, past games)
> - Pre-game waiting room with participant grid
> - Role reveal card (tap-to-flip)
> - Game board — murder weapon card (fullscreen)
> - Game board — Seer view (killer highlighted)
> - Game board — Healer view (revive buttons)
> - Self-death modal (location + time-of-day)
> - Killer Guess modal (3-screen flow)
> - Voting page — open window
> - Voting page — Spy live vote list
> - Voting page — results view
> - Post-game summary (winner banner + role/fate table)
> - Participants page
> - Admin login
> - Admin dashboard (stats + theme settings)
> - Admin player management
> - Admin role management
> - Admin games list
> - 4-step game creation wizard
> - Live game editor
> - Post-game archive (history viewer)

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
