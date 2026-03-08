import type { Metadata } from "next";
import { db } from "@/db";
import { users, roles } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { redirect } from "next/navigation";
import { NewGameWizard } from "./NewGameWizard";

export const metadata: Metadata = { title: "New Game" };

export default async function NewGamePage() {
  const session = await requireAdmin();
  if (!session) redirect("/");

  const [allPlayers, allRoles] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)),
    db.select().from(roles).orderBy(asc(roles.name)),
  ]);

  return <NewGameWizard players={allPlayers} roles={allRoles} />;
}
