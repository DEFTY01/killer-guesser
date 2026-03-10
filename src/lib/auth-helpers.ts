import { auth } from "@/lib/auth";

/**
 * Verifies the incoming request carries an admin NextAuth session.
 *
 * @returns `true` when the session has role="admin",
 *          or `null` if the session is absent or not admin.
 */
export async function requireAdmin(): Promise<true | null> {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    return null;
  }
  return true;
}
