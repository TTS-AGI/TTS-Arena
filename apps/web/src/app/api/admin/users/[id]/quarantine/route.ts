/** POST /api/admin/users/[id]/quarantine — quarantine/un-quarantine. Admin only. */
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/server/auth/admin";
import { setUserQuarantine } from "@/server/admin/queries";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await requireAdmin();
  if (!guard.ok) {
    return NextResponse.json({ error: "forbidden" }, { status: guard.status });
  }
  const { id } = await params;
  const userId = Number(id);
  if (!Number.isInteger(userId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 });
  }
  const body = (await req.json().catch(() => null)) as {
    quarantined?: boolean;
  } | null;
  const quarantined = body?.quarantined ?? true;

  const ok = await setUserQuarantine(userId, quarantined);
  if (!ok) {
    return NextResponse.json({ error: "user not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, quarantined });
}
