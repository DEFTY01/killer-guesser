import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { vote_window_overrides } from "@/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth-helpers";
import { sql } from "drizzle-orm";

// ── Zod schema ────────────────────────────────────────────────────

const overrideSchema = z.object({
  day_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Must be YYYY-MM-DD"),
  window_start: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
  window_end: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "Must be HH:MM"),
});

// ── GET /api/admin/games/[id]/vote-window-override ────────────────

/**
 * Returns all vote window overrides for a game, sorted by day_date desc.
 */
export async function GET(
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

  const { id: gameId } = await params;

  const overrides = await db
    .select()
    .from(vote_window_overrides)
    .where(eq(vote_window_overrides.game_id, gameId))
    .orderBy(desc(vote_window_overrides.day_date));

  return NextResponse.json({ success: true, data: overrides });
}

// ── POST /api/admin/games/[id]/vote-window-override ───────────────

/**
 * Upserts a vote window override for a specific date (INSERT OR REPLACE).
 */
export async function POST(
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

  const { id: gameId } = await params;

  const body = await req.json().catch(() => null);
  const parsed = overrideSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: `Invalid request: ${parsed.error.issues[0]?.message}`,
      },
      { status: 422 },
    );
  }

  const { day_date, window_start, window_end } = parsed.data;

  // Upsert: update if the (game_id, day_date) row already exists.
  const existing = await db
    .select({ id: vote_window_overrides.id })
    .from(vote_window_overrides)
    .where(
      and(
        eq(vote_window_overrides.game_id, gameId),
        eq(vote_window_overrides.day_date, day_date),
      ),
    )
    .limit(1);

  if (existing[0]) {
    await db
      .update(vote_window_overrides)
      .set({ window_start, window_end, created_at: sql`(unixepoch())` })
      .where(eq(vote_window_overrides.id, existing[0].id));
  } else {
    await db.insert(vote_window_overrides).values({
      game_id: gameId,
      day_date,
      window_start,
      window_end,
    });
  }

  const [saved] = await db
    .select()
    .from(vote_window_overrides)
    .where(
      and(
        eq(vote_window_overrides.game_id, gameId),
        eq(vote_window_overrides.day_date, day_date),
      ),
    )
    .limit(1);

  return NextResponse.json({ success: true, data: saved });
}
