/** GET /api/admin/votes?page&pageSize&modelType&userId — vote log. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import type { AdminVotesResponse } from "@ttsa/shared";
import { requireAdmin } from "@/server/auth/admin";
import { listVotes } from "@/server/admin/queries";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }

  const sp = req.nextUrl.searchParams;
  const page = Math.max(0, Number(sp.get("page") ?? 0) || 0);
  const pageSize = Math.min(100, Math.max(1, Number(sp.get("pageSize") ?? 25)));
  const modelType = sp.get("modelType")?.trim() || undefined;
  const userIdRaw = sp.get("userId");
  const userId =
    userIdRaw && Number.isInteger(Number(userIdRaw))
      ? Number(userIdRaw)
      : undefined;
  const flaggedOnly = sp.get("flagged") === "1";

  const body: AdminVotesResponse = await listVotes({
    page,
    pageSize,
    modelType,
    userId,
    flaggedOnly,
  });
  return NextResponse.json(body);
}
