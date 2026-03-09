import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { adminLoginPasswordSchema } from "@/lib/validations";

/**
 * POST /api/auth/admin-login
 *
 * Validates the submitted password against `ADMIN_PASSWORD` using a
 * constant-time SHA-256 comparison (crypto.timingSafeEqual) to prevent
 * timing side-channels. On success, sets an `admin_session` httpOnly cookie
 * (24 h) that is checked by `requireAdmin()` on all admin API routes.
 *
 * Body: `{ password: string }`
 *
 * @returns `{ ok: true }` with the session cookie on success, or
 *          `{ error: string }` with status 400 / 401 on failure.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = adminLoginPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request" },
      { status: 400 },
    );
  }

  const submitted = parsed.data.password;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
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
