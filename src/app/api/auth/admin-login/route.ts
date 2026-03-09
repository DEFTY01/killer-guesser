import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const submitted =
    typeof (body as Record<string, unknown>)?.password === "string"
      ? ((body as Record<string, unknown>).password as string)
      : undefined;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!submitted || !adminPassword) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  // Hash both values to equal-length buffers before timingSafeEqual to prevent
  // password-length timing side-channels.
  const submittedHash = crypto
    .createHash("sha256")
    .update(submitted)
    .digest();
  const adminHash = crypto
    .createHash("sha256")
    .update(adminPassword)
    .digest();

  const match = crypto.timingSafeEqual(submittedHash, adminHash);
  if (!match) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const token = crypto.randomBytes(32).toString("hex");

  const response = NextResponse.json({ ok: true });
  response.cookies.set("admin_session", token, {
    httpOnly: true,
    maxAge: 60 * 60 * 24,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });
  return response;
}
