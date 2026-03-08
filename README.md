# Mountain Killer Game

A real-time multiplayer guessing game. Work in progress — details coming soon.

## Tech stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19 · Tailwind CSS v4 |
| Database | Turso (libSQL / SQLite edge DB) |
| ORM | Drizzle ORM |
| Validation | Zod v4 |
| Admin auth | Auth.js v5 (credentials + OAuth) |
| Player auth | Nickname + avatar / session token flow |
| Avatar resize | Sharp (Lanczos3 · 500 × 500 px) with ONNX extension point |
| Testing | Vitest (unit) · Playwright (e2e) |
| CI/CD | GitHub Actions |
| Deploy | Vercel |

## Quick start

```bash
# 1. Install dependencies
npm install

# 2. Copy environment variables
cp .env.example .env.local
# Edit .env.local and fill in TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, AUTH_SECRET

# 3. Push the schema to Turso
npm run db:push

# 4. Start the dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test` | Vitest unit tests |
| `npm run test:coverage` | Unit tests + coverage report |
| `npm run test:e2e` | Playwright end-to-end tests |
| `npm run db:generate` | Generate Drizzle migration files |
| `npm run db:migrate` | Run pending migrations |
| `npm run db:push` | Push schema directly (dev only) |
| `npm run db:studio` | Open Drizzle Studio |

## Project structure

```
src/
├── app/                    # Next.js App Router
│   ├── (admin)/            # Admin section (Auth.js protected)
│   ├── (game)/             # Player game section
│   ├── api/                # API routes
│   │   ├── auth/           # Auth.js handlers
│   │   ├── avatar/         # Avatar upload + neural resize
│   │   └── player/         # Player session management
│   ├── globals.css         # Global styles + Tailwind v4 import
│   └── layout.tsx          # Root layout
├── components/
│   ├── ui/                 # Primitive UI components (Button, Card, Input)
│   ├── AvatarUpload.tsx    # Avatar upload component
│   └── PlayerLogin.tsx     # Multi-step player onboarding
├── db/
│   ├── schema.ts           # Drizzle schema (users, players, games)
│   └── index.ts            # Turso client + Drizzle instance
├── lib/
│   ├── auth.ts             # Auth.js v5 config
│   ├── avatar.ts           # Neural-quality avatar resize (Sharp / ONNX)
│   └── validations.ts      # Zod v4 schemas
└── types/
    └── index.ts            # Shared TypeScript types
tests/
├── unit/                   # Vitest tests
└── e2e/                    # Playwright tests
docs/                       # Architecture & design docs
agents.md                   # Agent map
```

## Documentation

- [Architecture](docs/architecture.md)
- [Authentication](docs/auth.md)
- [Database](docs/database.md)
- [Avatar processing](docs/avatar.md)
- [Deployment](docs/deployment.md)
- [Agent map](agents.md)

## Deploying to Vercel

1. Push to GitHub.
2. Import the repository in the [Vercel dashboard](https://vercel.com/new).
3. Set the environment variables from `.env.example` in the Vercel project settings.
4. Deploy — Vercel auto-detects Next.js.

## License

MIT