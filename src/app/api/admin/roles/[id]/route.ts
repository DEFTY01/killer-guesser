import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { roles } from "@/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { DEFAULT_ROLE_COLOR, ROLE_PERMISSIONS } from "@/lib/role-constants";

/** Zod schema for PATCH /api/admin/roles/[id] body. */
const updateRoleSchema = z.object({
  name: z.string().min(1, "Name is required").optional(),
  team: z.enum(["team1", "team2", "any"]).optional(),
  chance_percent: z
    .number()
    .min(0, "Chance must be at least 0")
    .max(100, "Chance must be at most 100")
    .optional(),
  description: z.string().optional().nullable(),
  color_hex: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid color hex")
    .optional()
    .nullable(),
  permissions: z.array(z.enum(ROLE_PERMISSIONS)).optional().nullable(),
});

/**
 * PATCH /api/admin/roles/[id]
 *
 * Updates one or more fields on the role identified by `id`.
 * Requires an admin session — returns 403 if not authenticated as admin.
 *
 * @returns `{ success: true; data: Role }` or `{ success: false; error: string }`
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return NextResponse.json(
      { success: false, error: "Invalid role id" },
      { status: 400 },
    );
  }

  const body = await req.json().catch(() => null);
  const parsed = updateRoleSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const updateData: Partial<{
    name: string;
    team: "team1" | "team2" | "any";
    chance_percent: number;
    description: string | null;
    color_hex: string;
    permissions: string | null;
  }> = {};

  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.team !== undefined) updateData.team = parsed.data.team;
  if (parsed.data.chance_percent !== undefined)
    updateData.chance_percent = parsed.data.chance_percent;
  if (parsed.data.description !== undefined)
    updateData.description = parsed.data.description;
  if (parsed.data.color_hex !== undefined)
    updateData.color_hex = parsed.data.color_hex ?? DEFAULT_ROLE_COLOR;
  if (parsed.data.permissions !== undefined) {
    updateData.permissions =
      parsed.data.permissions && parsed.data.permissions.length > 0
        ? JSON.stringify(parsed.data.permissions)
        : null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json(
      { success: false, error: "No fields to update" },
      { status: 422 },
    );
  }

  const [updated] = await db
    .update(roles)
    .set(updateData)
    .where(eq(roles.id, numericId))
    .returning();

  if (!updated) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  return NextResponse.json({ success: true, data: updated });
}

/**
 * DELETE /api/admin/roles/[id]
 *
 * Permanently deletes a role.
 * Returns 403 if the role has `is_default = 1` — default roles cannot be deleted.
 * Requires an admin session — returns 403 if not authenticated as admin.
 *
 * @returns `{ success: true; data: { id: number } }` or `{ success: false; error: string }`
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const { id } = await params;
  const numericId = Number(id);
  if (isNaN(numericId)) {
    return NextResponse.json(
      { success: false, error: "Invalid role id" },
      { status: 400 },
    );
  }

  // Fetch the role to check is_default before deleting.
  const [existing] = await db
    .select({ id: roles.id, is_default: roles.is_default })
    .from(roles)
    .where(eq(roles.id, numericId))
    .limit(1);

  if (!existing) {
    return NextResponse.json(
      { success: false, error: "Role not found" },
      { status: 404 },
    );
  }

  if (existing.is_default === 1) {
    return NextResponse.json(
      { success: false, error: "Default roles cannot be deleted" },
      { status: 403 },
    );
  }

  await db.delete(roles).where(eq(roles.id, numericId));

  return NextResponse.json({ success: true, data: { id: numericId } });
}
