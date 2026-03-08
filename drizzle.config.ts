import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL ?? process.env.TURSO_DATABASE_URL;
const authToken =
  process.env.DATABASE_AUTH_TOKEN ?? process.env.TURSO_AUTH_TOKEN;

if (!url) {
  throw new Error(
    "Missing database URL for Drizzle Kit. Set DATABASE_URL (preferred) or TURSO_DATABASE_URL.",
  );
}

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "turso",
  dbCredentials: {
    url,
    authToken,
  },
});
