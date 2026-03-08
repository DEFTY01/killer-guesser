# AGENT_MAP.md — Project Navigation Index

> **Last Updated:** 2026-03-08 (PROMPT 24 — Seer Killer Identification View: added src/lib/roleUtils.ts isKiller helper; GameBoardClient uses helper + shows Seer info banner; board API JSDoc hardened with security constraint)
>
> **Rule:** Read this file first at the start of every prompt. Only open files
> listed here **or** files explicitly mentioned in the current prompt.
> Update the **Last Updated** date and the relevant sections at the end of
> every prompt that creates or modifies files.

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

## Branch Strategy

| Branch | Purpose |
|---|---|
| `dev` | Active development — all feature branches merge here first |
| `main` | Production — only stable, reviewed code is merged from `dev` |

---

## Directory Structure

```
killer-guesser/
├── docs/                      # Developer documentation (architecture, auth, avatar, DB, deployment)
├── drizzle/                   # Auto-generated Drizzle migration files (do not edit manually)
├── src/
│   ├── app/
│   │   ├── (admin)/           # Admin route group (login, dashboard)
│   │   │   ├── admin/
│   │   │   │   ├── dashboard/ # Admin dashboard page
│   │   │   │   ├── login/     # Admin login page
│   │   │   │   ├── players/   # Player management pages
│   │   │   │   │   ├── new/   # Create new player page
│   │   │   │   │   ├── page.tsx              # Players list
│   │   │   │   │   └── DeletePlayerButton.tsx # Client delete button
│   │   │   │   ├── roles/     # Role management pages
│   │   │   │   │   ├── page.tsx              # Roles list (server component)
│   │   │   │   │   └── RolesClient.tsx       # Interactive table + add/edit panels (client)
│   │   │   │   ├── games/     # Game management pages
│   │   │   │   │   ├── page.tsx              # Games list (server component)
│   │   │   │   │   ├── new/                  # 4-step game creation wizard
│   │   │   │   │   │   ├── page.tsx          # Server wrapper (fetches players + roles)
│   │   │   │   │   │   └── NewGameWizard.tsx # 4-step client wizard component
│   │   │   │   │   └── [id]/                 # Game detail / live editor
│   │   │   │   │       ├── page.tsx          # Server wrapper (fetches game, settings, players, roles)
│   │   │   │   │       └── GameEditorClient.tsx # Live editor: status bar, players panel, actions panel
│   │   │   │   └── page.tsx   # Redirects → /admin/dashboard
│   │   │   └── layout.tsx     # Admin shell (role check, sidebar, bottom nav)
│   │   ├── (game)/            # Game route group
│   │   │   ├── game/          # Main game page
│   │   │   │   ├── page.tsx   # Join-game page (renders PlayerLogin)
│   │   │   │   └── [id]/      # Per-game board
│   │   │   │       ├── page.tsx          # Server wrapper → GameBoardClient
│   │   │   │       ├── GameBoardClient.tsx # Interactive game board (vote countdown, player grid, self-death modal, game-ended modal; subscribes to PLAYER_DIED, PLAYER_REVIVED, GAME_ENDED)
│   │   │   │       └── vote/[day]/       # Per-day voting page
│   │   │   │           ├── page.tsx       # Server wrapper → VotePageClient
│   │   │   │           └── VotePageClient.tsx # Voting UI: submit vote, spy view (VOTE_CAST), results (VOTE_CLOSED)
│   │   │   ├── lobby/         # Player lobby (active/upcoming/past games)
│   │   │   ├── participants/  # Pre-game participants page (avatar grid + team badges)
│   │   │   └── layout.tsx     # Game layout wrapper (player auth, sign-out)
│   │   ├── api/
│   │   │   ├── admin/
│   │   │   │   └── players/   # Admin player management API
│   │   │   │       ├── route.ts         # GET (list players) + POST (create player)
│   │   │   │       └── [id]/route.ts    # PATCH (update) + DELETE (soft-delete)
│   │   │   │   └── roles/     # Admin role management API
│   │   │   │       ├── route.ts         # GET (list roles) + POST (create role)
│   │   │   │       └── [id]/route.ts    # PATCH (update) + DELETE (forbidden if is_default=1)
│   │   │   │   └── games/     # Admin game management API
│   │   │   │       ├── route.ts         # GET (list games with player count) + POST (transactional create)
│   │   │   │       └── [id]/            # Per-game API
│   │   │   │           ├── route.ts     # GET (full game data) + PATCH (close_voting / close / delete)
│   │   │   │           ├── reroll/      # Re-randomise teams or roles
│   │   │   │           │   └── route.ts # POST ?type=teams|roles
│   │   │   │           └── players/[playerId]/
│   │   │   │               └── route.ts # PATCH (mark dead / change role)
│   │   │   ├── auth/          # NextAuth.js catch-all route handler
│   │   │   ├── avatar/        # Avatar upload API
│   │   │   ├── game/          # Player game API routes
│   │   │   │   ├── lobby/     # GET — active/scheduled/past games for current player
│   │   │   │   ├── participants/ # GET — pre-game participant list (no role/dead)
│   │   │   │   └── [id]/      # Per-game player API routes
│   │   │   │       ├── board/route.ts              # GET — role-filtered board data
│   │   │   │       ├── vote/[day]/route.ts         # GET — vote page data; POST — submit vote (publishes VOTE_CAST)
│   │   │   │       ├── vote/[day]/close/route.ts   # POST — compute results, publish VOTE_CLOSED
│   │   │   │       └── players/[playerId]/
│   │   │   │           ├── die/route.ts            # PATCH — self-report death (publishes PLAYER_DIED)
│   │   │   │           └── revive/route.ts         # POST — Healer revives player: checks is_dead=1, sets is_dead=0+revived_at, enforces revive_cooldown_seconds, publishes PLAYER_REVIVED
│   │   │   ├── player/        # Player registration / session API
│   │   │   └── upload/
│   │   │       └── avatar/    # Vercel Blob avatar upload endpoint
│   │   │       └── murder-item/ # Vercel Blob murder item upload endpoint
│   │   ├── login/             # Player login page (single-page avatar picker)
│   │   ├── globals.css        # Global styles (Tailwind v4 imports)
│   │   ├── layout.tsx         # Root layout (fonts, metadata)
│   │   └── page.tsx           # Home / landing page
│   ├── components/
│   │   ├── auth/
│   │   │   └── LoginScreen.tsx    # Single-page avatar-picker login (client component)
│   │   ├── game/                  # In-game components
│   │   │   ├── PlayerCard.tsx     # Role-aware player card (dead overlay, killer border, revive button)
│   │   │   └── VoteCountdown.tsx  # Live countdown to vote window end (hidden outside window)
│   │   ├── ui/                    # Shared design-system components (Button, Card, Input)
│   │   ├── AvatarUpload.tsx   # Avatar selection & upload UI
│   │   └── PlayerLogin.tsx    # Player nickname + avatar onboarding
│   ├── db/
│   │   ├── index.ts           # Drizzle client (Turso connection)
│   │   ├── migrations/        # Auto-generated Drizzle migration SQL files (do not edit manually)
│   │   ├── schema.ts          # Database schema definitions
│   │   └── seed.ts            # Idempotent seed script — inserts 6 default roles
│   ├── lib/
│   │   ├── ably.ts            # Ably server client + ABLY_CHANNELS + ABLY_EVENTS constants
│   │   ├── auth.ts            # NextAuth.js configuration
│   │   ├── avatar.ts          # Avatar resize helpers (Sharp → 500×500 PNG)
│   │   ├── blob.ts            # Vercel Blob upload helper (thin wrapper around @vercel/blob)
│   │   ├── gameEnd.ts         # Game-end logic: handleKillerDefeated, handleKillerWins, deleteGame, closeGame
│   │   ├── role-constants.ts  # Role permissions + colors
│   │   ├── roleUtils.ts       # Role utility helpers (isKiller)
│   │   └── validations.ts     # Zod schemas for shared validation
│   ├── hooks/
│   │   ├── useAbly.ts         # React hook: subscribe to an Ably channel/event with singleton client
│   │   └── useCountdown.ts    # Countdown hook: remaining h/m/s + isExpired, ticking every second
│   ├── middleware.ts          # Route-protection middleware (admin/game/login)
│   └── types/
│       └── index.ts           # Shared TypeScript types / interfaces
├── tests/
│   ├── e2e/                   # Playwright end-to-end tests
│   └── unit/                  # Vitest unit tests + setup
├── .env.example               # Required environment variable template
├── .env.local.example         # Local-only environment variable template
├── agents.md                  # Agent responsibility map (legacy — see AGENT_MAP.md)
├── AGENT_MAP.md               # ← This file
├── README.md                  # Project overview
├── drizzle.config.ts          # Drizzle Kit configuration
├── package.json               # Dependencies and npm scripts
├── playwright.config.ts       # Playwright configuration
└── vitest.config.ts           # Vitest configuration
```

---

## Key Files

| File | Purpose |
|---|---|
| `src/app/layout.tsx` | Root layout: applies Geist + Cinzel fonts, global metadata, global CSS, night-bg class |
| `src/app/page.tsx` | Landing / home page |
| `src/app/login/page.tsx` | Player login page — fetches players and renders `LoginScreen` |
| `src/app/(admin)/layout.tsx` | Admin shell: role-based auth, sidebar (desktop), bottom tab bar (mobile) |
| `src/app/(admin)/admin/page.tsx` | Redirects to `/admin/dashboard` |
| `src/app/(admin)/admin/dashboard/page.tsx` | Dashboard: stats cards, quick actions, recent games |
| `src/app/(admin)/admin/players/page.tsx` | Players list: avatar thumbnail, name, active status, edit/delete actions |
| `src/app/(admin)/admin/players/DeletePlayerButton.tsx` | Client-side delete (soft-delete) button with confirmation |
| `src/app/(admin)/admin/players/new/page.tsx` | New player form: name input, avatar upload with live preview |
| `src/app/(admin)/admin/roles/page.tsx` | Roles list: server component — fetches roles from DB, passes to RolesClient |
| `src/app/(admin)/admin/roles/RolesClient.tsx` | Interactive roles table: color swatch, inline chance slider (optimistic), add/edit panels, permission checkboxes, team-total warning |
| `src/app/(admin)/admin/games/page.tsx` | Games list: server component — fetches all games with player counts |
| `src/app/(admin)/admin/games/new/page.tsx` | New game wizard wrapper: server component fetches players + roles, renders NewGameWizard |
| `src/app/(admin)/admin/games/new/NewGameWizard.tsx` | 4-step game creation wizard (client): step 1 details, step 2 players/teams with avatar grid + randomize, step 3 roles/settings/murder item, step 4 summary + submit |
| `src/app/(admin)/admin/games/[id]/page.tsx` | Game editor: server component — fetches game, settings, players (with role data), and all roles; renders GameEditorClient |
| `src/app/(admin)/admin/games/[id]/GameEditorClient.tsx` | Live game editor (client): status bar, players panel with inline role selector + mark-dead toggle, actions panel with optimistic UI |
| `src/app/(game)/game/page.tsx` | Main game room page (renders PlayerLogin for join flow) |
| `src/app/(game)/game/[id]/page.tsx` | Game board: server wrapper — resolves `id` param and renders GameBoardClient |
| `src/app/(game)/game/[id]/GameBoardClient.tsx` | Interactive game board (client): vote countdown, murder item card, player grid, vote button, self-death modal; subscribes to PLAYER_DIED (instant grayscale), PLAYER_REVIVED (remove grayscale+X, show Undead), and GAME_ENDED (modal + 3s redirect) |
| `src/app/(game)/game/[id]/vote/[day]/page.tsx` | Voting page: server wrapper — resolves `id` + `day` params and renders VotePageClient |
| `src/app/(game)/game/[id]/vote/[day]/VotePageClient.tsx` | Voting page (client): submit vote, "already voted" state, collapsible "Secret Info 🕵️" spy view (see_votes only; shows voter/target avatars+names, "No votes yet", subscribes to VOTE_CAST for real-time live list), results view (subscribes to VOTE_CLOSED), vote-window timer triggers close call |
| `src/app/(game)/lobby/page.tsx` | Player lobby — client component: active games, upcoming games (with countdown), past games (win/loss); skeleton loading; empty state |
| `src/app/(game)/participants/page.tsx` | Participants page — client component: avatar grid (3-col), team badges, player count, back button |
| `src/hooks/useCountdown.ts` | `useCountdown(target: Date)` — returns `{ hours, minutes, seconds, isExpired }`, ticks every second, cleans up interval on unmount |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth.js route handler |
| `src/app/api/avatar/route.ts` | Handles avatar image upload (POST) |
| `src/app/api/player/route.ts` | Handles player registration / session (POST) |
| `src/app/globals.css` | Tailwind v4 CSS-first entry point |
| `src/components/auth/LoginScreen.tsx` | Single-page animated login: landing view + avatar-picker bottom sheet/modal |
| `src/components/PlayerLogin.tsx` | Nickname + avatar onboarding component |
| `src/components/AvatarUpload.tsx` | Avatar upload widget |
| `src/components/ui/Button.tsx` | Accessible Button component |
| `src/components/ui/Card.tsx` | Card layout component |
| `src/components/ui/Input.tsx` | Accessible Input component |
| `src/components/game/PlayerCard.tsx` | Role-aware player card: dead=grayscale+✕, undead=✕ removed+"Undead", killer (Seer view)=red border+"Killer", Healer view=Revive button; border in role color |
| `src/components/game/VoteCountdown.tsx` | Countdown timer to vote window end with "Time remaining to vote:" label — hidden outside vote window |
| `src/db/schema.ts` | Drizzle schema: 7 game tables (users, games, roles, game_players, votes, events, game_settings) + relations; game_settings includes revive_cooldown_seconds |
| `src/db/index.ts` | Re-exports `db`, `client`, and `Db` from `src/lib/db.ts` for backward compatibility |
| `src/db/seed.ts` | Idempotent seed script: inserts 6 default roles (Killer, Survivor, Seer, Healer, Mayor, Spy) — run with `npm run db:seed` |
| `src/lib/db.ts` | Drizzle + Turso client using `DATABASE_URL` / `DATABASE_AUTH_TOKEN`; exports `db` and raw `client` |
| `src/lib/auth.ts` | NextAuth.js v5 config — two Credentials providers: "player" (userId only, avatar-click) and "admin" (password-only, `timingSafeEqual`, hardcoded identity); JWT strategy; role + avatar_url + activeGameId in token & session |
| `src/lib/ably.ts` | Ably server-side REST client (`ablyServer`); `ABLY_CHANNELS` helpers (`game(id)`, `vote(id, day)`); `ABLY_EVENTS` constants (`player_died`, `vote_cast`, `vote_closed`, `game_ended`, `player_revived`) |
| `src/hooks/useAbly.ts` | `useAbly(channelName, eventName, onMessage)` — singleton Realtime client, subscribes on mount, unsubscribes on unmount, memoizes callback with `useCallback` |
| `src/lib/auth-helpers.ts` | Shared auth utilities — `requireAdmin()` returns the session or null |
| `src/lib/avatar.ts` | Sharp-based avatar resize → 500×500 PNG |
| `src/lib/blob.ts` | Thin wrapper around `@vercel/blob` — `uploadBlob(filename, buffer, mimeType)` → public URL |
| `src/lib/gameEnd.ts` | Game-end scenarios: `handleKillerDefeated` (killer voted out → archive events, close, survivors win), `handleKillerWins` (killer wins → archive events, close, killer team wins), `deleteGame` (hard-delete all game data), `closeGame` (close without deletion); all publish Ably `game_ended` event |
| `src/lib/role-constants.ts` | Shared role constants — `DEFAULT_ROLE_COLOR`, `ROLE_PERMISSIONS` tuple, `RolePermission` type |
| `src/lib/roleUtils.ts` | Role utility helpers — `isKiller(playerId, killerId)` for testable killer identification |
| `src/lib/validations.ts` | Zod schemas (player nickname, avatar, etc.) |
| `src/app/api/admin/players/route.ts` | GET (all players, ordered by name) + POST (create player with Zod validation) — admin only |
| `src/app/api/admin/players/[id]/route.ts` | PATCH (update player fields) + DELETE (soft-delete: sets is_active=0) — admin only |
| `src/app/api/admin/roles/route.ts` | GET (all roles, ordered by name) + POST (create role with Zod validation) — admin only |
| `src/app/api/admin/roles/[id]/route.ts` | PATCH (update role fields) + DELETE (forbidden if is_default=1; otherwise hard-delete) — admin only |
| `src/app/api/admin/games/route.ts` | GET (all games with player counts) + POST (create game in DB transaction: games + game_settings + game_players, Zod validation) — admin only |
| `src/app/api/admin/games/[id]/route.ts` | GET (full game with settings + players including role data) + PATCH (action: close_voting / close / delete) — admin only |
| `src/app/api/admin/games/[id]/players/[playerId]/route.ts` | PATCH (mark player dead / change role assignment) — admin only |
| `src/app/api/admin/games/[id]/reroll/route.ts` | POST ?type=teams (random 50/50 split) or ?type=roles (weighted random by chance_percent) — admin only |
| `src/app/api/upload/avatar/route.ts` | POST: multipart form, validates webp/gif + 4 MB limit, uploads to Vercel Blob |
| `src/app/api/upload/murder-item/route.ts` | POST: multipart form, validates jpeg/png/webp/gif + 4 MB limit, uploads to Vercel Blob with unique filename |
| `src/middleware.ts` | Route-protection: `/admin/login` → `/admin/dashboard` if admin; `/admin/*` → admin role required (→ `/admin/login`); `/game/*` → player role required (→ `/login`); `/login` → redirect to `/` if player session active |
| `src/types/index.ts` | Shared TypeScript types + Drizzle `$inferSelect`/`$inferInsert` types for all 7 schema tables |
| `src/db/migrations/0000_crazy_martin_li.sql` | Initial Drizzle migration: creates all 7 game tables |
| `src/db/migrations/0001_confused_squadron_sinister.sql` | Migration: change `users.role` default from `'member'` to `'player'` |
| `src/db/migrations/0002_revive_cooldown.sql` | Migration: add `revive_cooldown_seconds` integer column to `game_settings` |
| `tests/unit/validations.test.ts` | Unit tests for Zod validation schemas |
| `tests/unit/roleUtils.test.ts` | Unit tests for `isKiller` helper |
| `tests/unit/gameEnd.test.ts` | Unit tests for all four game-end functions (DB transaction, archiving, deletion, Ably publish) |
| `tests/unit/avatar.test.ts` | Unit tests for avatar resize logic |
| `tests/unit/Button.test.tsx` | Unit tests for Button UI component |
| `tests/e2e/app.spec.ts` | Playwright smoke tests |
| `docs/architecture.md` | High-level architecture overview |
| `docs/auth.md` | Auth flow documentation |
| `docs/avatar.md` | Avatar pipeline documentation |
| `docs/database.md` | Database schema documentation |
| `docs/deployment.md` | Deployment guide |

---

## API Routes

| Method | Path | Handler file | Description |
|---|---|---|---|
| `GET/POST` | `/api/auth/[...nextauth]` | `src/app/api/auth/[...nextauth]/route.ts` | NextAuth.js catch-all (sign-in, session, CSRF) |
| `POST` | `/api/auth/callback/player` | `src/app/api/auth/[...nextauth]/route.ts` | Credentials callback for the "player" provider (userId, no password) |
| `POST` | `/api/auth/callback/admin` | `src/app/api/auth/[...nextauth]/route.ts` | Credentials callback for the "admin" provider (password-only) |
| `POST` | `/api/player` | `src/app/api/player/route.ts` | Register player nickname; create/return session |
| `POST` | `/api/avatar` | `src/app/api/avatar/route.ts` | Upload & resize player avatar (→ Vercel Blob) |
| `GET` | `/api/admin/players` | `src/app/api/admin/players/route.ts` | List all player accounts ordered by name — admin only |
| `POST` | `/api/admin/players` | `src/app/api/admin/players/route.ts` | Create new player account (Zod validation) — admin only |
| `PATCH` | `/api/admin/players/[id]` | `src/app/api/admin/players/[id]/route.ts` | Update player fields — admin only |
| `DELETE` | `/api/admin/players/[id]` | `src/app/api/admin/players/[id]/route.ts` | Soft-delete player (sets is_active=0) — admin only |
| `GET` | `/api/admin/roles` | `src/app/api/admin/roles/route.ts` | List all roles ordered by name — admin only |
| `POST` | `/api/admin/roles` | `src/app/api/admin/roles/route.ts` | Create new role (Zod validation: name, team, chance_percent required; description, color_hex, permissions optional) — admin only |
| `PATCH` | `/api/admin/roles/[id]` | `src/app/api/admin/roles/[id]/route.ts` | Update role fields — admin only |
| `DELETE` | `/api/admin/roles/[id]` | `src/app/api/admin/roles/[id]/route.ts` | Delete role (403 if is_default=1 with message "Default roles cannot be deleted") — admin only |
| `GET` | `/api/admin/games` | `src/app/api/admin/games/route.ts` | List all games with per-game player counts ordered by created_at desc — admin only |
| `POST` | `/api/admin/games` | `src/app/api/admin/games/route.ts` | Create game in a single DB transaction (games + game_settings + game_players); accepts optional `revive_cooldown_seconds` — admin only |
| `GET` | `/api/admin/games/[id]` | `src/app/api/admin/games/[id]/route.ts` | Get full game data (game + settings + players with role details) — admin only |
| `PATCH` | `/api/admin/games/[id]` | `src/app/api/admin/games/[id]/route.ts` | Update game state: action "close_voting" (null vote window + publish VOTE_CLOSED with results), "close" (set status=closed), "delete" (hard delete + cascade) — admin only |
| `PATCH` | `/api/admin/games/[id]/players/[playerId]` | `src/app/api/admin/games/[id]/players/[playerId]/route.ts` | Update game player: is_dead (0/1) and/or role_id — admin only |
| `POST` | `/api/admin/games/[id]/reroll` | `src/app/api/admin/games/[id]/reroll/route.ts` | Re-randomise teams (?type=teams, 50/50 Fisher-Yates) or roles (?type=roles, weighted random by chance_percent) — admin only |
| `POST` | `/api/upload/avatar` | `src/app/api/upload/avatar/route.ts` | Upload avatar to Vercel Blob (webp/gif only, max 4 MB) |
| `POST` | `/api/upload/murder-item` | `src/app/api/upload/murder-item/route.ts` | Upload murder item image to Vercel Blob (jpeg/png/webp/gif, max 4 MB) |
| `GET` | `/api/game/lobby` | `src/app/api/game/lobby/route.ts` | Returns `{ active, scheduled, past }` games for the current player — player session required |
| `GET` | `/api/game/participants` | `src/app/api/game/participants/route.ts` | Returns players in the current player's active/scheduled game with name, avatar_url, team (no role/is_dead) |
| `GET` | `/api/game/[id]/board` | `src/app/api/game/[id]/board/route.ts` | Role-filtered board: all players (name, avatar_url, team, is_dead, revived_at, role_color) + game/settings/caller; `see_killer` → `killer_id`; `see_votes` → today's vote details |
| `PATCH` | `/api/game/[id]/players/[playerId]/die` | `src/app/api/game/[id]/players/[playerId]/die/route.ts` | Self-report death — caller must own the game_player; body: `{ location, time_of_day }`; publishes `PLAYER_DIED` to game channel |
| `POST` | `/api/game/[id]/players/[playerId]/revive` | `src/app/api/game/[id]/players/[playerId]/revive/route.ts` | Healer revives a dead player — requires `revive_dead` permission; checks `is_dead=1`; sets `is_dead=0` + `revived_at`; enforces `revive_cooldown_seconds` (429 if cooldown active); publishes `PLAYER_REVIVED` to game channel with full player data |
| `GET` | `/api/game/[id]/vote/[day]` | `src/app/api/game/[id]/vote/[day]/route.ts` | Vote page data: game meta, players, caller, has_voted; `see_votes` → today's votes with voter/target names and avatar_url |
| `POST` | `/api/game/[id]/vote/[day]` | `src/app/api/game/[id]/vote/[day]/route.ts` | Submit vote — one per player per day; body: `{ target_id }`; publishes `VOTE_CAST` to vote channel with voter/target names and avatar_url |
| `POST` | `/api/game/[id]/vote/[day]/close` | `src/app/api/game/[id]/vote/[day]/close/route.ts` | Close vote window — computes grouped results, publishes `VOTE_CLOSED` to game channel; idempotent |

> This table will be expanded as new API routes are added.

---

## Installed Packages

### Production Dependencies

| Package | Version | Purpose |
|---|---|---|
| `next` | `^16.1.6` | Next.js App Router framework |
| `react` / `react-dom` | `^19.2.4` | React UI library |
| `typescript` | `^5.9.3` | Static type checking |
| `geist` | `^1.7.0` | Geist font family |
| `next-auth` | `5.0.0-beta.30` | Authentication (Auth.js v5) |
| `@auth/drizzle-adapter` | `^1.11.1` | Drizzle ORM adapter for Auth.js |
| `drizzle-orm` | `^0.45.1` | Type-safe SQL ORM |
| `@libsql/client` | `^0.17.0` | Turso/libSQL database client |
| `ably` | `^2.19.0` | Real-time pub/sub messaging |
| `@vercel/blob` | `^2.3.1` | Vercel Blob object storage |
| `zustand` | `^5.0.11` | Lightweight React state management |
| `date-fns` | `^4.1.0` | Date utility functions |
| `zod` | `^4.3.6` | Schema validation and type inference |
| `sharp` | `^0.34.5` | Image processing (avatar resize → 500×500 PNG) |

### Dev Dependencies

| Package | Version | Purpose |
|---|---|---|
| `drizzle-kit` | `^0.31.9` | Drizzle schema migrations CLI |
| `tsx` | `^4.21.0` | TypeScript-first Node.js script runner |
| `@types/node` | `^25.3.5` | TypeScript types for Node.js |
| `@types/react` | `^19.2.14` | TypeScript types for React |
| `@types/react-dom` | `^19.2.3` | TypeScript types for React DOM |
| `vitest` | `^4.0.18` | Unit test runner (Vite-native) |
| `@vitest/coverage-v8` | `^4.0.18` | V8-based code coverage for Vitest |
| `@vitejs/plugin-react` | `^4.4.1` | Vite React plugin (used by Vitest) |
| `@testing-library/react` | `^16.3.0` | React component testing utilities |
| `@testing-library/jest-dom` | `^6.6.3` | Custom Jest/Vitest DOM matchers |
| `jsdom` | `^26.1.0` | DOM environment for unit tests |
| `@playwright/test` | `^1.58.2` | End-to-end browser testing |
| `tailwindcss` | `^4.2.1` | Utility-first CSS framework (v4 CSS-first) |
| `@tailwindcss/postcss` | `^4.2.1` | PostCSS plugin for Tailwind v4 |
| `postcss` | `^8.5.8` | CSS transformation tool |

---

## DO NOT OPEN

The following config files are managed by the scaffolding or tooling and must
**not** be opened or modified without explicit permission:

- `next.config.ts`
- `tailwind.config.ts` *(not present — Tailwind v4 is CSS-first)*
- `tsconfig.json`
- `postcss.config.mjs`
- `drizzle.config.ts`
- `vitest.config.ts`
- `playwright.config.ts`
- `package-lock.json`
- `.gitignore`
