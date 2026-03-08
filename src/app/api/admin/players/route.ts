import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

/** Zod schema for POST /api/admin/players body. */
const createPlayerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  avatar_url: z.string().url().optional().nullable(),
});

/**
 * GET /api/admin/players
 *
 * Returns all player accounts ordered by name (ascending).
 * The admin account is never stored in the database and will never appear here.
 * Requires an admin session — returns 403 if not authenticated as admin.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const players = await db
    .select()
    .from(users)
    .orderBy(asc(users.name));

  return NextResponse.json({ success: true, data: players });
}

/**
 * POST /api/admin/players
 *
 * Creates a new player account.
 * Body: `{ name: string; avatar_url?: string | null }`
 * There is no role field — all accounts created here are players.
 * Requires an admin session — returns 403 if not authenticated as admin.
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
  const parsed = createPlayerSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 },
    );
  }

  const [player] = await db
    .insert(users)
    .values({
      name: parsed.data.name,
      role: "player",
      avatar_url: parsed.data.avatar_url ?? null,
    })
    .returning();

  return NextResponse.json({ success: true, data: player }, { status: 201 });
}
