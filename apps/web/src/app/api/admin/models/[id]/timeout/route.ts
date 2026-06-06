/**
 * POST /api/admin/models/[id]/timeout — time a model out for N hours, or clear
 * its time-out. Body: { hours: number } | { clear: true }. Admin only.
 *
 * Time-out is a temporary suppression from battles, distinct from isActive.
 */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { timeOutModel, clearModelTimeout } from "@/server/admin/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as {
    hours?: number;
    clear?: boolean;
  } | null;

  if (body?.clear) {
    const ok = await clearModelTimeout(id);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ error: "model not found" }, { status: 404 });
  }

  const hours = Number(body?.hours);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 30) {
    return NextResponse.json({ error: "invalid hours" }, { status: 400 });
  }
  const ok = await timeOutModel(id, hours);
  return ok
    ? NextResponse.json({ ok: true })
    : NextResponse.json({ error: "model not found" }, { status: 404 });
}
