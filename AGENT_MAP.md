# AGENT_MAP.md — Project Navigation Index

> **Last Updated:** 2026-03-08 (PROMPT 05 — Turso DB connection & Drizzle client)
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
│   │   │   │   ├── login/     # Admin login page
│   │   │   │   └── page.tsx   # Admin dashboard
│   │   │   └── layout.tsx     # Admin layout wrapper
│   │   ├── (game)/            # Game route group
│   │   │   ├── game/          # Main game page
│   │   │   └── layout.tsx     # Game layout wrapper
│   │   ├── api/
│   │   │   ├── auth/          # NextAuth.js catch-all route handler
│   │   │   ├── avatar/        # Avatar upload API
│   │   │   └── player/        # Player registration / session API
│   │   ├── globals.css        # Global styles (Tailwind v4 imports)
│   │   ├── layout.tsx         # Root layout (fonts, metadata)
│   │   └── page.tsx           # Home / landing page
│   ├── components/
│   │   ├── ui/                # Shared design-system components (Button, Card, Input)
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
| `src/app/layout.tsx` | Root layout: applies Geist font, global metadata, global CSS |
| `src/app/page.tsx` | Landing / home page |
| `src/app/(admin)/admin/login/page.tsx` | Admin login UI |
| `src/app/(admin)/admin/page.tsx` | Admin dashboard |
| `src/app/(game)/game/page.tsx` | Main game room page |
| `src/app/api/auth/[...nextauth]/route.ts` | NextAuth.js route handler |
| `src/app/api/avatar/route.ts` | Handles avatar image upload (POST) |
| `src/app/api/player/route.ts` | Handles player registration / session (POST) |
| `src/app/globals.css` | Tailwind v4 CSS-first entry point |
| `src/components/PlayerLogin.tsx` | Nickname + avatar onboarding component |
| `src/components/AvatarUpload.tsx` | Avatar upload widget |
| `src/components/ui/Button.tsx` | Accessible Button component |
| `src/components/ui/Card.tsx` | Card layout component |
| `src/components/ui/Input.tsx` | Accessible Input component |
| `src/db/schema.ts` | Drizzle schema (players, sessions, games, …) |
| `src/db/index.ts` | Re-exports `db`, `client`, and `Db` from `src/lib/db.ts` for backward compatibility |
| `src/lib/db.ts` | Drizzle + Turso client using `DATABASE_URL` / `DATABASE_AUTH_TOKEN`; exports `db` and raw `client` |
| `src/lib/auth.ts` | NextAuth.js v5 config (providers, adapter, callbacks) |
| `src/lib/avatar.ts` | Sharp-based avatar resize → 500×500 PNG |
| `src/lib/validations.ts` | Zod schemas (player nickname, avatar, etc.) |
| `src/types/index.ts` | Shared TypeScript types; placeholder for schema-inferred types (exported later) |
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
| `@aws-sdk/client-s3` | `^3.1004.0` | AWS / Cloudflare R2 S3-compatible object storage |
| `@aws-sdk/s3-request-presigner` | `^3.1004.0` | Generate pre-signed S3/R2 URLs |
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
