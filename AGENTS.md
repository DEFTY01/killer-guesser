<!-- bmad:context -->
<!-- Verified 2026-10-20 against e4e07d8. Managed by bmad-project-context; edits inside this block are replaced on refresh. Keep anything you want preserved outside the markers. -->

## killer-guesser (Summit of Lies)

Real-time social-deduction game for ski trips: Next.js 16 App Router, TypeScript, Turso/libSQL via Drizzle, Auth.js v5 (admin), Ably (realtime), Vercel Blob + sharp (avatars). File index: `AGENT_MAP.md`; developer docs: `docs/`.

## Where things are

- Read `AGENT_MAP.md` before navigating; update it after adding, moving or removing files.
- Migrations: `src/db/migrations/` (generated, never hand-edit). Schema: `src/db/schema.ts`.
- Team/role assignment: `src/lib/assignTeamsAndRoles.ts`; win conditions: `src/lib/gameEnd.ts`.
- Vote rounds (overnight windows, DST, per-day overrides): `src/lib/voteRound.ts`, `votingState.ts`; tally and elimination: `voteClose.ts`. Use these; never derive the vote day from `start_time` arithmetic.
- Player login is game code + per-game PIN: `src/lib/playerLogin.ts`, `credentials.ts`.

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
- Never send a bare `.select()` of `game_players` to a browser: it carries `pin_hash`. Use `safeGamePlayerColumns` (`src/db/gamePlayerColumns.ts`).
- Never put other players' role colours, teams or roles in an API response or a realtime event: each role colour is unique, so it reveals the Killer. Votes are secret: the public `vote-*` channel carries counters only; voter identity goes on `spy-*`, which only `see_votes` roles may subscribe to (`src/app/api/ably/token/route.ts`).
- `drizzle-kit migrate` cannot build a fresh database (duplicate `0013` migrations, hand-written ones missing from the journal); build local and CI databases with `npm run db:push`, and add new schema changes with `npm run db:generate`.
- Tests mock the db chain; type mock return as `unknown` (see `src/test/unit/gameEnd.test.ts`) or `tsc` fails.
<!-- /bmad:context -->

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
