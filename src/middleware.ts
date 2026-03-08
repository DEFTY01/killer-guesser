import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

/**
 * Route-protection middleware powered by Auth.js v5.
 *
 * Rules:
 *  - /admin/login     → redirects to /admin/dashboard if already an admin.
 *  - /admin/*         → requires role === "admin"; redirects to /admin/login otherwise.
 *  - /game/*          → requires role === "player"; redirects to /login otherwise.
 *  - /login           → redirects to / if the user already has an active player session.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  // /admin/login → redirect to dashboard if already an admin.
  if (pathname === "/admin/login") {
    if (role === "admin") {
      return NextResponse.redirect(new URL("/admin/dashboard", req.url));
    }
    return NextResponse.next();
  }

  // All other /admin/* routes (explicitly excluding /admin/login) → require admin role.
  if (pathname.startsWith("/admin") && pathname !== "/admin/login") {
    if (role !== "admin") {
      return NextResponse.redirect(new URL("/admin/login", req.url));
    }
  }

  // /game/* → require player role.
  if (pathname.startsWith("/game")) {
    if (role !== "player") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // /login → redirect players with an active session to /.
  if (pathname === "/login") {
    if (role === "player") {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }
});

export const config = {
  matcher: ["/admin/:path*", "/game/:path*", "/login"],
};
