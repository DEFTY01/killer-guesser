import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { ablyServer } from "@/lib/ably";

/**
 * GET /api/ably/token
 *
 * Issues a short-lived, subscribe-only Ably token request for the signed-in
 * user. The browser never sees the API key; publishing stays server-side.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  if (!process.env.ABLY_API_KEY) {
    return NextResponse.json(
      { success: false, error: "Realtime is not configured" },
      { status: 503 },
    );
  }

  const tokenRequest = await ablyServer.auth.createTokenRequest({
    clientId: String(session.user.id),
    capability: { "game-*": ["subscribe"], "vote-*": ["subscribe"] },
    ttl: 60 * 60 * 1000,
  });

  return NextResponse.json(tokenRequest, {
    headers: { "Cache-Control": "no-store" },
  });
}
