import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/**
 * Route-protection middleware.
 *
 * Rules:
 *  - /admin/login  → redirect to /admin/dashboard if admin NextAuth session present.
 *  - /admin/*      → require admin NextAuth session; redirect to /admin/login otherwise.
 *  - /game/*       → require player NextAuth session; redirect to /login otherwise.
 *  - /login        → redirect to /lobby if the user already has an active player session.
 *  - /lobby        → require player NextAuth session; redirect to /login otherwise.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const role = req.auth?.user?.role;

  // ── Admin routes: NextAuth session with role="admin" ────────────
  if (pathname === "/admin/login") {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  if (pathname.startsWith("/admin")) {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
    return NextResponse.next();
  }

  // ── Player routes: NextAuth session with role="player" ──────────
  if (pathname.startsWith("/game")) {
    if (role !== "player") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  if (pathname === "/login") {
    if (role === "player") {
      return NextResponse.redirect(new URL("/lobby", req.url));
    }
  }

  if (pathname === "/lobby") {
    if (role !== "player") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/game/:path*", "/login", "/lobby"],
};
