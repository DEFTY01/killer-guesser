import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";

function createDb() {
  const url = process.env.TURSO_DATABASE_URL;
  if (!url) {
    // Fall back to in-memory SQLite for local dev/tests when no Turso URL is
    // configured.  Never use this path in production.
    return drizzle(createClient({ url: "file:local.db" }), { schema });
  }

  const client = createClient({
    url,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });

  return drizzle(client, { schema });
}

export const db = createDb();
export type Db = typeof db;
