# Architecture

## Overview

Summit of Lies is a Next.js 16 application using the App Router. It has two user flows:

1. **Admin** — authenticated via Auth.js v5 (credentials or OAuth). Manages games and players.
2. **Player** — anonymous flow: pick a nickname, upload an avatar, join a game via a 6-character code.

## Directory layout

```
src/app/
├── (admin)/      Route group — all pages require Auth.js session
├── (game)/       Route group — player-facing pages
└── api/          Server-side API routes
```

## Request lifecycle

```
Browser
  │
  ▼
Next.js Edge / Node.js runtime
  │
  ├── Static pages  →  React Server Components
  ├── API routes    →  Route Handlers (src/app/api/**/route.ts)
  └── Auth          →  Auth.js JWT session (httpOnly cookie)
                         │
                         └── Drizzle ORM  →  Turso (libSQL)
```

## Data flow — avatar upload

```
Client (AvatarUpload.tsx)
  │  POST /api/avatar  multipart/form-data
  ▼
src/app/api/avatar/route.ts
  │  validate with Zod
  │  Buffer.from(file.arrayBuffer())
  ▼
src/lib/avatar.ts  →  Sharp.resize(500, 500, { kernel: lanczos3 })
  │
  ▼
Drizzle → players.avatarData (BLOB)
```

## Key design decisions

- **Turso** is chosen for globally distributed SQLite — zero-config local dev with `file:local.db` fallback.
- **Drizzle ORM** provides type-safe SQL with no runtime overhead.
- **Auth.js v5 JWT strategy** avoids a `sessions` table lookup on every request.
- **Player sessions** are a simple token stored in `localStorage` / `sessionStorage` — no server-side session table needed for game play.
