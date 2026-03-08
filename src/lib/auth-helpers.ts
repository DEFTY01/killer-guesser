import { auth } from "@/lib/auth";

/**
 * Verifies the incoming request carries an admin session.
 *
 * @returns The session object when the caller is authenticated as admin,
 *          or `null` if the session is absent or the role is not "admin".
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session || session.user?.role !== "admin") {
    return null;
  }
  return session;
}
