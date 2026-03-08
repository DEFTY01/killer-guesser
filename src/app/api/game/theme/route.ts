import { NextResponse } from "next/server";
import { db } from "@/db";
import { app_settings } from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/game/theme
 *
 * Returns the current background image URLs for the client-side layout.
 * Public — no authentication required.
 */
export async function GET() {
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
