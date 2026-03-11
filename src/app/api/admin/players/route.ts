import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { users } from "@/db/schema";
import { asc, count, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";

/** Zod schema for POST /api/admin/players body. */
const createPlayerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  avatar_url: z.string().url().optional().nullable(),
});

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/**
 * GET /api/admin/players[?page=1&limit=20]
 *
 * Returns player accounts ordered by name (ascending), paginated.
 * The admin account is never stored in the database and will never appear here.
 * Requires an admin session — returns 403 if not authenticated as admin.
 *
 * Query params:
 *  - `page`  — 1-based page number (default: 1)
 *  - `limit` — records per page (default: 20, max: 100)
 */
export async function GET(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403 },
    );
  }

  const pageParam = req.nextUrl.searchParams.get("page");
  const limitParam = req.nextUrl.searchParams.get("limit");

  const limit = Math.min(
    Math.max(1, Number(limitParam) || DEFAULT_PAGE_LIMIT),
    MAX_PAGE_LIMIT,
  );
  const page = Math.max(1, Number(pageParam) || 1);
  const offset = (page - 1) * limit;

  const [players, [totalRow]] = await Promise.all([
    db.select().from(users).orderBy(asc(users.name)).limit(limit).offset(offset),
    db.select({ total: count(users.id) }).from(users),
  ]);

  const total = totalRow?.total ?? 0;

  return NextResponse.json({
    success: true,
    data: players,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    },
  });
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
