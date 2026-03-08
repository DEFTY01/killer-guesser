import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { playerRegisterSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

const SESSION_TTL_S = 24 * 60 * 60; // 24 hours in seconds

/**
 * POST /api/player
 *
 * Create a new player user and issue a session token.
 * Body: { nickname: string }
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = playerRegisterSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message },
      { status: 422 }
    );
  }

  const sessionToken = crypto.randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_S;

  const [player] = await db
    .insert(users)
    .values({
      name: parsed.data.nickname,
      role: "player",
    })
    .returning();

  return NextResponse.json(
    {
      success: true,
      data: {
        playerId: player.id,
        name: player.name,
        sessionToken,
        expiresAt,
      },
    },
    { status: 201 }
  );
}

/**
 * GET /api/player?id=<userId>
 *
 * Retrieve the player for the given user ID.
 */
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json(
      { success: false, error: "Missing id" },
      { status: 400 }
    );
  }

  const [player] = await db
    .select()
    .from(users)
    .where(eq(users.id, Number(id)))
    .limit(1);

  if (!player) {
    return NextResponse.json(
      { success: false, error: "Player not found" },
      { status: 404 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      playerId: player.id,
      name: player.name,
      avatarUrl: player.avatar_url,
    },
  });
}
