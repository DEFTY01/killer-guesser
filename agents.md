# Agent Map — Killer Guesser

This file describes the responsibilities and boundaries of each agent (AI or
human) that may work on this codebase.

---

## Agents

### `scaffolding-agent`
**Purpose:** Initial project scaffolding — creates the folder structure, config
files, and boilerplate code.  
**Owns:**
- `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`
- `drizzle.config.ts`, `vitest.config.ts`, `playwright.config.ts`
- `.env.example`, `.gitignore`
- `docs/`, `agents.md`, `README.md`

---

### `db-agent`
**Purpose:** Manages the database schema and migrations.  
**Owns:**
- `src/db/schema.ts`
- `src/db/index.ts`
- `drizzle/` (migration files)

**Constraints:** Must run `npm run db:generate` after every schema change and
commit the resulting migration files.

---

### `auth-agent`
**Purpose:** Admin authentication via Auth.js v5.  
**Owns:**
- `src/lib/auth.ts`
- `src/app/api/auth/[...nextauth]/route.ts`
- `src/app/(admin)/admin/login/page.tsx`

**Constraints:** Must not break the player session flow. Changes to the Drizzle
adapter tables require coordination with `db-agent`.

---

### `player-agent`
**Purpose:** Player onboarding — nickname selection, avatar upload, session flow.  
**Owns:**
- `src/app/api/player/route.ts`
- `src/app/api/avatar/route.ts`
- `src/components/PlayerLogin.tsx`
- `src/components/AvatarUpload.tsx`
- `src/lib/avatar.ts`

**Constraints:** Avatar output must always be exactly 500 × 500 px PNG.

---

### `game-agent`
**Purpose:** Game room creation, real-time play, scoring.  
**Owns:**
- `src/app/(game)/`
- `src/app/api/game/` (to be created)
- Game-related schema additions (via `db-agent`)

---

### `ui-agent`
**Purpose:** Design system and shared UI components.  
**Owns:**
- `src/components/ui/`
- `src/app/globals.css`

**Constraints:** All components must be accessible (ARIA), responsive, and
dark-mode-compatible.

---

### `test-agent`
**Purpose:** Test coverage — unit (Vitest) and end-to-end (Playwright).  
**Owns:**
- `tests/`
- `vitest.config.ts`, `playwright.config.ts`

**Constraints:** Coverage must not drop below 80 % for `src/lib/` and
`src/components/ui/`.

---

### `ci-agent`
**Purpose:** CI/CD pipelines and deployment configuration.  
**Owns:**
- `.github/workflows/`
- `vercel.json` (if needed)

**Constraints:** All required checks must pass on `main`. Never skip tests.
