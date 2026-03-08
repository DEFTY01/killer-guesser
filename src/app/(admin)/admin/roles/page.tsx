import type { Metadata } from "next";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { asc } from "drizzle-orm";
import type { Role } from "@/types";
import RolesClient from "./RolesClient";

export const metadata: Metadata = { title: "Roles" };

export default async function RolesPage() {
  const allRoles: Role[] = await db
    .select()
    .from(roles)
    .orderBy(asc(roles.name));

  return <RolesClient initialRoles={allRoles} />;
}
