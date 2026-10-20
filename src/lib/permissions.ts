import type { RolePermission } from "@/lib/role-constants";

/** Parses the JSON permission list stored on a role; bad data means no permissions. */
export function parsePermissions(raw: string | null | undefined): RolePermission[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as RolePermission[]) : [];
  } catch {
    return [];
  }
}
