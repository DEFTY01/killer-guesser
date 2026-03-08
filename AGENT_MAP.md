# AGENT_MAP.md — Project Navigation Index

> **Last Updated:** 2026-03-08 (PROMPT 10)
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
| Object Storage | Cloudflare R2 |
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
│   │   │   │   └── page.tsx   # Redirects → /admin/dashboard
│   │   │   └── layout.tsx     # Admin shell (role check, sidebar, bottom nav)
│   │   ├── (game)/            # Game route group
│   │   │   ├── game/          # Main game page
│   │   │   └── layout.tsx     # Game layout wrapper
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth.js catch-all route handler
│   │   │   ├── avatar/        # Avatar upload API
│   │   │   └── player/        # Player registration / session API
│   │   ├── login/             # Player login page (single-page avatar picker)
│   │   ├── globals.css        # Global styles (Tailwind v4 imports)
│   │   ├── layout.tsx         # Root layout (fonts, metadata)
│   │   └── page.tsx           # Home / landing page
│   ├── components/
│   │   ├── auth/
│   │   │   └── LoginScreen.tsx    # Single-page avatar-picker login (client component)
│   │   ├── ui/                    # Shared design-system components (Button, Card, Input)
│   │   ├── AvatarUpload.tsx   # Avatar selection & upload UI
│   │   └── PlayerLogin.tsx    # Player nickname + avatar onboarding
│   ├── db/
│   │   ├── index.ts           # Drizzle client (Turso connection)
│   │   └── schema.ts          # Database schema definitions
│   ├── lib/
│   │   ├── auth.ts            # NextAuth.js configuration
│   │   ├── avatar.ts          # Avatar resize helpers (Sharp → 500×500 PNG)
│   │   └── validations.ts     # Zod schemas for shared validation
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
| `src/app/(admin)/admin/login/page.tsx` | Admin login UI |
| `src/app/(game)/game/page.tsx` | Main game room page |
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
| `src/db/schema.ts` | Drizzle schema (players, sessions, games, …) |
| `src/db/index.ts` | Drizzle + Turso client singleton |
| `src/lib/auth.ts` | NextAuth.js v5 config (providers, adapter, callbacks) |
| `src/lib/avatar.ts` | Sharp-based avatar resize → 500×500 PNG |
| `src/lib/validations.ts` | Zod schemas (player nickname, avatar, etc.) |
| `src/types/index.ts` | Shared TypeScript types |
| `tests/unit/validations.test.ts` | Unit tests for Zod validation schemas |
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
| `POST` | `/api/player` | `src/app/api/player/route.ts` | Register player nickname; create/return session |
| `POST` | `/api/avatar` | `src/app/api/avatar/route.ts` | Upload & resize player avatar (→ Cloudflare R2) |

> This table will be expanded as new API routes are added.

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
