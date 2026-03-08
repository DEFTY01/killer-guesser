import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { DEFAULT_ROLE_COLOR, ROLE_PERMISSIONS } from "@/lib/role-constants";

/** Zod schema for POST /api/admin/roles body. */
const createRoleSchema = z.object({
  name: z.string().min(1, "Name is required"),
  team: z.enum(["team1", "team2", "any"]),
  chance_percent: z
    .number()
    .min(0, "Chance must be at least 0")
    .max(100, "Chance must be at most 100"),
  description: z.string().optional().nullable(),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color hex")
    .optional()
    .nullable(),
  permissions: z.array(z.enum(ROLE_PERMISSIONS)).optional(),
});

/**
 * GET /api/admin/roles
 *
 * Returns all roles ordered by name (ascending).
 * Requires an admin session — returns 403 if not authenticated as admin.
 *
 * @returns `{ success: true; data: Role[] }` or `{ success: false; error: string }`
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const allRoles = await db.select().from(roles).orderBy(asc(roles.name));

  return NextResponse.json({ success: true, data: allRoles });
}

/**
 * POST /api/admin/roles
 *
 * Creates a new role.
 * Body: `{ name: string; team: "team1"|"team2"|"any"; chance_percent: number; description?: string|null; color_hex?: string|null; permissions?: string[] }`
 * Requires an admin session — returns 403 if not authenticated as admin.
 *
 * @returns `{ success: true; data: Role }` (201) or `{ success: false; error: string }` (422/403)
 */
export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = createRoleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const { name, team, chance_percent, description, color_hex, permissions } =
    parsed.data;

  const [role] = await db
    .insert(roles)
    .values({
      name,
      team,
      chance_percent,
      description: description ?? null,
      color_hex: color_hex ?? DEFAULT_ROLE_COLOR,
      permissions: permissions && permissions.length > 0
        ? JSON.stringify(permissions)
        : null,
      is_default: 0,
    })
    .returning();

  return NextResponse.json({ success: true, data: role }, { status: 201 });
}
