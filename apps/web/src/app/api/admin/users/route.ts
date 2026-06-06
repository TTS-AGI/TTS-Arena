/** GET /api/admin/users?page&pageSize&search — paginated user list. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import type { AdminUsersResponse } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { listUsers } from "@/server/admin/queries";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 25)));
  const search = sp.get("search")?.trim() || undefined;

  const body: AdminUsersResponse = await listUsers({ page, pageSize, search });
  return NextResponse.json(body);
}
