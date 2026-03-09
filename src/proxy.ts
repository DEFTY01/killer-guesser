import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/**
 * Route-protection middleware.
 *
 * Rules:
 *  - /admin/login  → redirect to /admin/dashboard if admin_session cookie present.
 *  - /admin/*      → require admin_session cookie; redirect to /admin/login otherwise.
 *  - /game/*       → require NextAuth player session; redirect to /login otherwise.
 *  - /login        → redirect to / if the user already has an active player session.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;

  // ── Admin routes: cookie-based auth ──────────────────────────────
  const adminCookie = req.cookies.get("admin_session");

  if (pathname === "/admin/login") {
    if (adminCookie?.value) {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (!adminCookie?.value) {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Player routes: NextAuth session ──────────────────────────────
  const role = req.auth?.user?.role;

  if (pathname.startsWith("/game")) {
    if (role !== "player") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname === "/login") {
    if (role === "player") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/game/:path*", "/login"],
};
