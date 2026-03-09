import { cookies } from "next/headers";

/**
 * Verifies the incoming request carries an admin session cookie.
 *
 * @returns `true` when the `admin_session` cookie is present,
 *          or `null` if the cookie is absent.
 */
export async function requireAdmin(): Promise<true | null> {
  const jar = await cookies();
  const session = jar.get("admin_session");
  if (!session?.value) {
    return null;
  }
  return true;
}
