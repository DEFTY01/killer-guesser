<!-- bmad:context -->
<!-- Verified 2026-10-20 against 14dd2e2. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## killer-guesser (Summit of Lies)

Real-time social-deduction game for ski trips: Next.js 16 App Router, TypeScript, Turso/libSQL via Drizzle, Auth.js v5 (admin), Ably (realtime), Vercel Blob + sharp (avatars). File index: `AGENT_MAP.md`; developer docs: `docs/`.

## Where things are

- Read `AGENT_MAP.md` before navigating; update it after adding, moving or removing files.
- Migrations: `src/db/migrations/` (generated, never hand-edit). Schema: `src/db/schema.ts`.
- Team/role assignment: `src/lib/assignTeamsAndRoles.ts`; win conditions: `src/lib/gameEnd.ts`.

## Running and verifying

- Node 22. `npm test` runs Vitest only; `npm run test:ci` runs lint, type-check and build but not the unit tests. Run both before a PR.
- CI also runs Playwright (Chromium only) after `npx drizzle-kit push --force`, with `TURSO_DATABASE_URL=file:ci.db` and `AUTH_SECRET` set.
- Drizzle Kit throws without a DB URL, even for `db:generate`: prefix `DATABASE_URL=file:local.db`.

## Conventions that differ from defaults

- After any `schema.ts` change run `npm run db:generate` and commit the migration.
- Avatars are exactly 500×500 PNG (`src/lib/avatar.ts`).
- Game roles and abilities resolve server-side only; never expose role data to unauthorized callers.
- Evil roles cycle when fewer than Evil players; this is intended.

## Known pitfalls

- Never commit real secrets to `.env.example`; use placeholders.
- Tests mock the db chain; type mock return as `unknown` (see `src/test/unit/gameEnd.test.ts`) or `tsc` fails.
<!-- /bmad:context -->
