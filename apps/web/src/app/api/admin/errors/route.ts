/** GET /api/admin/errors?page&pageSize&source&severity&model&search — paginated log. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import type { AdminErrorsResponse } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { listErrors } from "@/server/admin/queries";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 50)));
  const source = sp.get("source")?.trim() || undefined;
  const severity = sp.get("severity")?.trim() || undefined;
  const model = sp.get("model")?.trim() || undefined;
  const search = sp.get("search")?.trim() || undefined;

  const body: AdminErrorsResponse = await listErrors({
    page,
    pageSize,
    source,
    severity,
    model,
    search,
  });
  return NextResponse.json(body);
}
