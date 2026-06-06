/**
 * Admin authorization. A user is an admin iff their username is in ADMIN_USERS
 * (see src/server/env.ts). Shared by the /admin layout (which redirects) and
 * every /api/admin route (which 401/403s).
 */
import type { UserRow } from "../db/schema";
import { isAdmin } from "../env";
import { currentUser } from "./user";

export type AdminGuard =
  | { ok: true; user: UserRow }
  | { ok: false; status: 401 | 403 };

/** Resolve the current admin, or a reason it was denied. */
export async function requireAdmin(): Promise<AdminGuard> {
  const user = await currentUser();
  if (!user) return { ok: false, status: 401 };
  if (!isAdmin(user.username)) return { ok: false, status: 403 };
  return { ok: true, user };
}

/** Convenience for server components: the admin row, or null if not allowed. */
export async function currentAdmin(): Promise<UserRow | null> {
  const guard = await requireAdmin();
  return guard.ok ? guard.user : null;
}
