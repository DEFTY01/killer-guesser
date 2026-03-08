import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "@/db/schema";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error(
    "Missing required environment variable: DATABASE_URL. " +
      "Set DATABASE_URL to your Turso database URL (e.g. libsql://your-db.turso.io) " +
      "in your .env.local file.",
  );
}

export const client = createClient({
  url,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
export type Db = typeof db;

