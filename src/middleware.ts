import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

/**
 * Route-protection middleware powered by Auth.js v5.
 *
 * Rules:
 *  - /admin/*  → requires role === "admin"; redirects to / otherwise.
 *  - /game/*   → requires an authenticated session; redirects to /login otherwise.
 *  - /login    → redirects already-authenticated users to /.
 */
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;
  const role = session?.user?.role;

  // Already logged-in users don't need the login page.
  if (pathname === "/login" && session) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Admin section: requires the "admin" role.
  if (pathname.startsWith("/admin") && role !== "admin") {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Game section: requires any authenticated session.
  if (pathname.startsWith("/game") && !session) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/admin/:path*", "/game/:path*", "/login"],
};
