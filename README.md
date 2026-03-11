# Summit of Lies

A real-time social deduction game for ski trip groups. Players are secretly split into Evil (Killers) and Good (Survivors) teams; they vote out suspects each night, use special role abilities, and race to eliminate the other side. An admin dashboard manages games, players, roles, and live match state.

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

## Project Structure

For the full directory structure, file purposes, and API route reference see [AGENT_MAP.md](AGENT_MAP.md).
