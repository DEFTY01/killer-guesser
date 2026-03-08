# Authentication

## Admin authentication (Auth.js v5)

Admin users sign in at `/admin/login`. Auth.js handles:

- **Credentials provider** — email + password (extend with hashed passwords in `src/lib/auth.ts`).
- **OAuth providers** — GitHub and Google are scaffolded; enable them by adding `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` etc. to `.env.local` and uncommenting the providers.
- **JWT session strategy** — session state is stored in a signed, httpOnly cookie. No database roundtrip per request.
- **Drizzle adapter** — `users`, `accounts`, `sessions`, and `verificationTokens` tables are managed by `@auth/drizzle-adapter`.

All routes under `src/app/(admin)` are protected by the layout:

```ts
// src/app/(admin)/layout.tsx
const session = await auth();
if (!session) redirect("/admin/login");
```

## Player authentication (avatar/session flow)

Players do **not** use Auth.js. They follow a lightweight flow:

1. `POST /api/player` — submit a nickname → receive a UUID session token.
2. Token is stored in `sessionStorage` on the client.
3. Subsequent requests include `?token=<token>` (or a Bearer header) for identity.
4. `GET /api/player?token=<token>` validates and returns the player.

Session tokens expire after **24 hours** (configurable in `src/app/api/player/route.ts`).

## Environment variables

| Variable | Description |
|---|---|
| `AUTH_SECRET` | Secret used to sign JWT sessions (generate with `openssl rand -base64 33`) |
| `AUTH_URL` | Canonical URL of the app (e.g. `https://killer-guesser.vercel.app`) |
| `AUTH_GITHUB_ID` | GitHub OAuth App client ID (optional) |
| `AUTH_GITHUB_SECRET` | GitHub OAuth App client secret (optional) |
