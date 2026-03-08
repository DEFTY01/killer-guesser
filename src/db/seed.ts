import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq } from "drizzle-orm";
import * as schema from "./schema";
import { roles } from "./schema";

const DEFAULT_ROLES: (typeof schema.roles.$inferInsert)[] = [
  {
    name: "Killer",
    team: "team1",
    chance_percent: 100,
    color_hex: "#EF4444",
    is_default: 1,
    permissions: null,
  },
  {
    name: "Survivor",
    team: "team2",
    chance_percent: 70,
    color_hex: "#3B82F6",
    is_default: 1,
    permissions: null,
  },
  {
    name: "Seer",
    team: "team2",
    chance_percent: 10,
    color_hex: "#8B5CF6",
    is_default: 1,
    permissions: JSON.stringify(["see_killer"]),
  },
  {
    name: "Healer",
    team: "team2",
    chance_percent: 8,
    color_hex: "#22C55E",
    is_default: 1,
    permissions: JSON.stringify(["revive_dead"]),
  },
  {
    name: "Mayor",
    team: "team2",
    chance_percent: 5,
    color_hex: "#EAB308",
    is_default: 1,
    permissions: null,
  },
  {
    name: "Spy",
    team: "team2",
    chance_percent: 7,
    color_hex: "#14B8A6",
    is_default: 1,
    permissions: JSON.stringify(["see_votes"]),
  },
];

async function seed() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "Missing required environment variable: DATABASE_URL. " +
        "Set DATABASE_URL in your .env.local file.",
    );
  }

  const client = createClient({
    url,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });

  const db = drizzle(client, { schema });

  console.log("🌱 Seeding default roles...");

  const existing = await db
    .select({ name: roles.name })
    .from(roles)
    .where(eq(roles.is_default, 1));

  const existingNames = new Set(existing.map((r) => r.name));
  const toInsert = DEFAULT_ROLES.filter((r) => !existingNames.has(r.name));

  if (toInsert.length === 0) {
    console.log("✅ All default roles already exist — nothing to insert.");
  } else {
    await db.insert(roles).values(toInsert);
    console.log(
      `✅ Inserted ${toInsert.length} role(s): ${toInsert.map((r) => r.name).join(", ")}`,
    );
  }

  await client.close();
}

seed().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});
