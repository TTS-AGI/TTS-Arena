/** GET /api/admin/security/events?page&pageSize&severity — paginated feed. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import type { AdminSecurityEventsResponse } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { listSecurityEvents } from "@/server/admin/queries";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 50)));
  const severity = sp.get("severity")?.trim() || undefined;

  const body: AdminSecurityEventsResponse = await listSecurityEvents({
    page,
    pageSize,
    severity,
  });
  return NextResponse.json(body);
}
