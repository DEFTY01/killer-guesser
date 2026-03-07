import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { players } from "@/db/schema";
import { playerRegisterSchema } from "@/lib/validations";
import { eq } from "drizzle-orm";

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * POST /api/player
 *
 * Create a new player and issue a session token.
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
  const sessionExpiresAt = new Date(Date.now() + SESSION_TTL_MS);

  const [player] = await db
    .insert(players)
    .values({
      nickname: parsed.data.nickname,
      sessionToken,
      sessionExpiresAt,
    })
    .returning();

  return NextResponse.json(
    {
      success: true,
      data: {
        playerId: player.id,
        nickname: player.nickname,
        sessionToken: player.sessionToken,
        expiresAt: player.sessionExpiresAt?.getTime() ?? null,
      },
    },
    { status: 201 }
  );
}

/**
 * GET /api/player?token=<sessionToken>
 *
 * Retrieve the player for the given session token.
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json(
      { success: false, error: "Missing token" },
      { status: 400 }
    );
  }

  const [player] = await db
    .select()
    .from(players)
    .where(eq(players.sessionToken, token))
    .limit(1);

  if (!player || (player.sessionExpiresAt && player.sessionExpiresAt.getTime() < Date.now())) {
    return NextResponse.json(
      { success: false, error: "Invalid or expired session" },
      { status: 401 }
    );
  }

  return NextResponse.json({
    success: true,
    data: {
      playerId: player.id,
      nickname: player.nickname,
      avatarUrl: player.avatarUrl,
    },
  });
}
