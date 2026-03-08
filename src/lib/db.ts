import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const authToken =
  process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error(
    "Missing database URL. Set DATABASE_URL (preferred) or TURSO_DATABASE_URL " +
      "to your Turso database URL (e.g. libsql://your-db.turso.io).",
  );
}

// Vercel serverless functions cannot reliably use a local SQLite file.
if (process.env.VERCEL === "1" && url.startsWith("file:")) {
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

