import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { app_settings } from "@/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";

const patchSchema = z.object({
  bg_light_url: z.string().url().nullable().optional(),
  bg_dark_url: z.string().url().nullable().optional(),
});

/**
 * GET /api/admin/settings
 *
 * Returns the current global background image URLs.
 * Requires admin authentication.
 */
export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [row] = await db
    .select()
    .from(app_settings)
    .where(eq(app_settings.id, 1))
    .limit(1);

  return NextResponse.json({
    bg_light_url: row?.bg_light_url ?? null,
    bg_dark_url: row?.bg_dark_url ?? null,
  });
}

/**
 * PATCH /api/admin/settings
 *
 * Updates global background image URLs (Vercel Blob URLs).
 * Pass `null` to clear a URL.
 * Requires admin authentication.
 */
export async function PATCH(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { bg_light_url, bg_dark_url } = parsed.data;

  // Require at least one field to update.
  if (bg_light_url === undefined && bg_dark_url === undefined) {
    return NextResponse.json(
      { error: "Provide at least one of bg_light_url or bg_dark_url" },
      { status: 422 },
    );
  }

  // Upsert the singleton row (id = 1).
  await db
    .insert(app_settings)
    .values({
      id: 1,
      bg_light_url: bg_light_url ?? null,
      bg_dark_url: bg_dark_url ?? null,
    })
    .onConflictDoUpdate({
      target: app_settings.id,
      set: {
        ...(bg_light_url !== undefined ? { bg_light_url } : {}),
        ...(bg_dark_url !== undefined ? { bg_dark_url } : {}),
      },
    });

  const [updated] = await db
    .select()
    .from(app_settings)
    .where(eq(app_settings.id, 1))
    .limit(1);

  return NextResponse.json({
    bg_light_url: updated?.bg_light_url ?? null,
    bg_dark_url: updated?.bg_dark_url ?? null,
  });
}
