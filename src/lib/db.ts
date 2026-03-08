import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

// Fall back to a local SQLite file when no remote URL is configured.
// This matches the documented behaviour: "No Turso account is needed to run locally."
// On first use run `npm run db:push` to create the schema in local.db.
const url =
  process.env.DATABASE_URL ??
  process.env.TURSO_DATABASE_URL ??
  "file:local.db";
const authToken =
  process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

// Vercel serverless functions cannot reliably use a local SQLite file.
// Skip this check during `next build` (NEXT_PHASE === 'phase-production-build')
// so the module can be statically analysed without DATABASE_URL being present.
// The error will still be raised at runtime if the URL is not configured.
if (
  process.env.VERCEL === "1" &&
  url.startsWith("file:") &&
  process.env.NEXT_PHASE !== "phase-production-build"
) {
  throw new Error(
    `Invalid DATABASE_URL on Vercel: ${url}. ` +
      "Use a remote libsql URL (libsql://...) and set DATABASE_AUTH_TOKEN.",
  );
}

export const client = createClient({
  url,
  authToken,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;

