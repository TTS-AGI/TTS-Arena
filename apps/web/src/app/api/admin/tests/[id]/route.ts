/**
 * GET /api/admin/tests/[id] — a run's live detail (progress + per-model
 * results, with audio URLs for samples produced so far). Admin only.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { testRunDetail } from "@/server/admin/queries";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const { id } = await params;
  const detail = await testRunDetail(Number(id));
  if (!detail) {
    return NextResponse.json({ error: "run not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
